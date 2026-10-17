import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  QrCode,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  UtensilsCrossed,
  CheckSquare,
  Square,
  Layers,
  Info,
  FileDown,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { RestaurantTable } from '../../../types/restaurant';
import { Tenant } from '../../../types/saas';
import { generateQrCodeDataUrl, buildTableCatalogUrl } from '../../../utils/qrCodeGenerator';
import { api } from '../../../services/api';

interface PrintQrModalProps {
  isOpen: boolean;
  tenant: Tenant | null;
  table?: RestaurantTable | null;
  allTables?: RestaurantTable[];
  onClose: () => void;
  onTokenRegenerated?: (tableId: string, newToken: string) => void;
}

interface LoadedLogo {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

// Converte URL de imagem externa para Base64 preservando dimensões e proporção nativas
const getBase64ImageFromUrl = async (url: string): Promise<LoadedLogo> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 200;
        const h = img.naturalHeight || img.height || 60;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas não disponível'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: w,
          height: h,
          aspectRatio: Math.max(0.1, w / Math.max(1, h)),
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

export const PrintQrModal: React.FC<PrintQrModalProps> = ({
  isOpen,
  tenant,
  table,
  allTables = [],
  onClose,
  onTokenRegenerated,
}) => {
  const [tablesList, setTablesList] = useState<RestaurantTable[]>(allTables);
  const [loadingFreshTables, setLoadingFreshTables] = useState<boolean>(false);
  const [singleQrUrl, setSingleQrUrl] = useState<string>('');
  const [batchQrUrls, setBatchQrUrls] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'single' | 'batch'>(table ? 'single' : 'batch');
  const [density, setDensity] = useState<'standard' | 'compact'>('standard');
  const [filterMode, setFilterMode] = useState<'all' | 'active'>('all');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(true);

  // Logo da empresa: reaproveita exatamente a mesma fonte de dados da impressão individual
  const logoUrl = tenant?.appearance?.logoUrl || (tenant as any)?.logoUrl || '';

  // Pré-carregamento da logo para garantir que ela esteja na memória antes do print
  useEffect(() => {
    if (!logoUrl) {
      setLogoLoaded(true);
      return;
    }
    setLogoLoaded(false);
    const img = new Image();
    img.src = logoUrl;
    img.onload = () => setLogoLoaded(true);
    img.onerror = () => setLogoLoaded(true);
  }, [logoUrl]);

  // Atualiza tablesList sempre que allTables mudar
  useEffect(() => {
    if (allTables && allTables.length > 0) {
      setTablesList(allTables);
    }
  }, [allTables]);

  // Ao abrir o modal, busca a lista completa e fresca do servidor para garantir 100% das mesas cadastradas
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingFreshTables(true);

    api.getRestaurantTables()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setTablesList(data);
        }
      })
      .catch((err) => {
        console.warn('Não foi possível sincronizar mesas diretamente:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingFreshTables(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Inicialização de modo e QR Code individual se aplicável
  useEffect(() => {
    if (table) {
      setMode('single');
      const url = buildTableCatalogUrl(tenant?.slug || '', table.qrCodeToken);
      generateQrCodeDataUrl(url, { width: 400, margin: 2 }).then(setSingleQrUrl);
    } else {
      setMode('batch');
    }
  }, [table, tenant, isOpen]);

  // Estatísticas de mesas cadastradas
  const totalRegisteredCount = tablesList.length;
  const activeCount = useMemo(
    () => tablesList.filter((t) => t.isActive !== false).length,
    [tablesList]
  );
  const inactiveCount = totalRegisteredCount - activeCount;

  // Lista de mesas elegíveis respeitando o filtro escolhido ('all' inclui 100% das mesas)
  const eligibleTables = useMemo(() => {
    return tablesList.filter((t) => {
      if (filterMode === 'active' && t.isActive === false) return false;
      return true;
    });
  }, [tablesList, filterMode]);

  // Inicialização inteligente da seleção: seleciona todas as mesas elegíveis
  useEffect(() => {
    if (eligibleTables.length > 0) {
      setSelectedTableIds((prev) => {
        if (prev.length > 0) {
          const eligibleSet = new Set(eligibleTables.map((t) => t.id));
          const validSelected = prev.filter((id) => eligibleSet.has(id));
          if (validSelected.length > 0) return validSelected;
        }
        return eligibleTables.map((t) => t.id);
      });
    }
  }, [eligibleTables]);

  // Geração assíncrona e paralela de todos os QR Codes em lote
  useEffect(() => {
    if (!isOpen || tablesList.length === 0) return;

    let isCancelled = false;
    const generateAll = async () => {
      setGeneratingBatch(true);
      const dict: Record<string, string> = { ...batchQrUrls };

      try {
        const missing = tablesList.filter((t) => !dict[t.id]);
        if (missing.length === 0) {
          setGeneratingBatch(false);
          return;
        }

        const promises = missing.map(async (t) => {
          const url = buildTableCatalogUrl(tenant?.slug || '', t.qrCodeToken);
          const qr = await generateQrCodeDataUrl(url, { width: 360, margin: 2 });
          return { id: t.id, qr };
        });

        const results = await Promise.all(promises);
        if (!isCancelled) {
          results.forEach(({ id, qr }) => {
            dict[id] = qr;
          });
          setBatchQrUrls(dict);
        }
      } catch (err) {
        console.error('Erro ao gerar QR Codes em lote:', err);
      } finally {
        if (!isCancelled) {
          setGeneratingBatch(false);
        }
      }
    };

    generateAll();

    return () => {
      isCancelled = true;
    };
  }, [tablesList, tenant?.slug, isOpen]);

  const selectedTablesList = useMemo(() => {
    return eligibleTables.filter((t) => selectedTableIds.includes(t.id));
  }, [eligibleTables, selectedTableIds]);

  // Paginação controlada para folha A4 (9 por página em standard 3x3 ou 12 por página em compact 3x4)
  const cardsPerPage = density === 'compact' ? 12 : 9;
  const pagedTables = useMemo(() => {
    const pages: RestaurantTable[][] = [];
    for (let i = 0; i < selectedTablesList.length; i += cardsPerPage) {
      pages.push(selectedTablesList.slice(i, i + cardsPerPage));
    }
    return pages;
  }, [selectedTablesList, cardsPerPage]);

  const totalPagesCount = pagedTables.length;

  if (!isOpen) return null;

  const currentTableUrl = table ? buildTableCatalogUrl(tenant?.slug || '', table.qrCodeToken) : '';

  const handleCopyLink = () => {
    if (!currentTableUrl) return;
    navigator.clipboard.writeText(currentTableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    if (!table) return;
    if (!confirm('Deseja gerar um novo QR Code para esta mesa? O QR Code antigo deixará de funcionar imediatamente.')) {
      return;
    }
    try {
      setRegenerating(true);
      const newToken = await api.regenerateTableQrToken(table.id);
      const newUrl = buildTableCatalogUrl(tenant?.slug || '', newToken);
      const newQr = await generateQrCodeDataUrl(newUrl, { width: 400, margin: 2 });
      setSingleQrUrl(newQr);
      if (onTokenRegenerated) {
        onTokenRegenerated(table.id, newToken);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao regerar QR Code.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownloadSingle = () => {
    if (!singleQrUrl || !table) return;
    const a = document.createElement('a');
    a.href = singleQrUrl;
    a.download = `qrcode-mesa-${table.tableNumber}.png`;
    a.click();
  };

  const handleSelectAll = () => {
    setSelectedTableIds(eligibleTables.map((t) => t.id));
  };

  const handleClearSelection = () => {
    setSelectedTableIds([]);
  };

  const toggleTableSelection = (tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  // Disparo de impressão nativa do navegador
  const handlePrint = () => {
    if (generatingBatch || !logoLoaded) return;
    window.print();
  };

  // GERAÇÃO DIRETA DE ARQUIVO PDF (A4) MULTI-PÁGINA COM PROPORÇÃO EXATA DA LOGO E SEM SOBREPOSIÇÃO
  const handleDownloadPdf = async () => {
    if (generatingBatch) return;

    try {
      setDownloadingPdf(true);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Obtém logo com dimensões e proporção nativas
      let logoInfo: LoadedLogo | null = null;
      if (logoUrl) {
        try {
          logoInfo = await getBase64ImageFromUrl(logoUrl);
        } catch (e) {
          console.warn('Logo externa não convertida para PDF, usando texto alternativo:', e);
        }
      }

      if (mode === 'single' && table) {
        // ==========================================
        // PDF INDIVIDUAL (1 Mesa Centralizada no A4)
        // ==========================================
        const cardW = 105;
        const cardH = 145;
        const x = (210 - cardW) / 2;
        const y = (297 - cardH) / 2;

        // Borda do Cartão
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, y, cardW, cardH, 4, 4, 'S');

        let curY = y + 8;

        // 1. Logo da Empresa preservando proporção
        if (logoInfo) {
          const maxW = 55;
          const maxH = 16;
          let logoW = maxW;
          let logoH = maxW / logoInfo.aspectRatio;
          if (logoH > maxH) {
            logoH = maxH;
            logoW = maxH * logoInfo.aspectRatio;
          }
          const logoX = x + (cardW - logoW) / 2;
          try {
            doc.addImage(logoInfo.dataUrl, 'PNG', logoX, curY, logoW, logoH, undefined, 'FAST');
            curY += logoH + 3.5;
          } catch {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(15, 23, 42);
            doc.text(tenant?.name ? tenant.name.toUpperCase() : 'RESTAURANTE', x + cardW / 2, curY + 6, { align: 'center' });
            curY += 10;
          }
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(15, 23, 42);
          doc.text(tenant?.name ? tenant.name.toUpperCase() : 'RESTAURANTE', x + cardW / 2, curY + 6, { align: 'center' });
          curY += 10;
        }

        // Subtítulo
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CARDÁPIO DIGITAL', x + cardW / 2, curY, { align: 'center' });
        curY += 7;

        // Número da Mesa
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(2, 6, 23);
        doc.text(`Mesa ${table.tableNumber}`, x + cardW / 2, curY, { align: 'center' });
        curY += 6;

        if (table.name) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text(table.name, x + cardW / 2, curY, { align: 'center' });
          curY += 6;
        }

        // QR Code
        const qrSize = 52;
        const qrX = x + (cardW - qrSize) / 2;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(qrX - 2, curY - 2, qrSize + 4, qrSize + 4, 2, 2, 'S');

        if (singleQrUrl) {
          doc.addImage(singleQrUrl, 'PNG', qrX, curY, qrSize, qrSize);
        }
        curY += qrSize + 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text('Aponte a câmera do celular', x + cardW / 2, curY, { align: 'center' });
        curY += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Faça seus pedidos direto na mesa', x + cardW / 2, curY, { align: 'center' });

        doc.save(`qrcode-mesa-${table.tableNumber}.pdf`);
      } else {
        // ==========================================
        // PDF EM LOTE (Grade de 3 Colunas A4 Multi-página)
        // ==========================================
        if (selectedTablesList.length === 0) {
          alert('Nenhuma mesa selecionada para impressão.');
          return;
        }

        const pageWidth = 210;
        const marginX = 8;
        const marginTop = 9;
        const cols = 3;
        const rows = density === 'compact' ? 4 : 3;
        const colGap = 4;
        const rowGap = density === 'compact' ? 3.5 : 4.5;
        const cardWidth = (pageWidth - 2 * marginX - (cols - 1) * colGap) / cols; // ~62mm
        const cardHeight = density === 'compact' ? 56 : 76; // milímetros rigorosos
        const totalPerSheet = cols * rows;

        // Pré-calcula tamanho da logo respeitando a proporção nativa
        const maxLogoW = density === 'compact' ? 28 : 34;
        const maxLogoH = density === 'compact' ? 7.5 : 9.5;
        let logoW = 0;
        let logoH = 0;
        if (logoInfo) {
          if (logoInfo.aspectRatio > maxLogoW / maxLogoH) {
            logoW = maxLogoW;
            logoH = Math.max(3, maxLogoW / logoInfo.aspectRatio);
          } else {
            logoH = maxLogoH;
            logoW = Math.max(6, maxLogoH * logoInfo.aspectRatio);
          }
        }

        for (let i = 0; i < selectedTablesList.length; i++) {
          const indexInSheet = i % totalPerSheet;
          const colIndex = indexInSheet % cols;
          const rowIndex = Math.floor(indexInSheet / cols);

          if (i > 0 && indexInSheet === 0) {
            doc.addPage();
          }

          const x = marginX + colIndex * (cardWidth + colGap);
          const y = marginTop + rowIndex * (cardHeight + rowGap);
          const t = selectedTablesList[i];
          const qrDataUrl = batchQrUrls[t.id];

          // Borda externa do cartão
          doc.setDrawColor(15, 23, 42);
          doc.setLineWidth(0.35);
          doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'S');

          let curY = y + (density === 'compact' ? 2.5 : 3.5);

          // 1. Logo ou Nome da Empresa
          if (logoInfo) {
            try {
              const logoX = x + (cardWidth - logoW) / 2;
              doc.addImage(logoInfo.dataUrl, 'PNG', logoX, curY, logoW, logoH, undefined, 'FAST');
              curY += logoH + (density === 'compact' ? 1.8 : 2.5);
            } catch {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(density === 'compact' ? 7 : 8);
              doc.setTextColor(15, 23, 42);
              doc.text(tenant?.name ? tenant.name.toUpperCase().slice(0, 22) : 'RESTAURANTE', x + cardWidth / 2, curY + 2.5, { align: 'center' });
              curY += 4.5;
            }
          } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(density === 'compact' ? 7 : 8);
            doc.setTextColor(15, 23, 42);
            doc.text(tenant?.name ? tenant.name.toUpperCase().slice(0, 22) : 'RESTAURANTE', x + cardWidth / 2, curY + 2.5, { align: 'center' });
            curY += 4.5;
          }

          // Subtítulo: "CARDÁPIO DIGITAL" (NÃO duplica o nome da empresa quando já existe logo)
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(density === 'compact' ? 5.5 : 6.5);
          doc.setTextColor(100, 116, 139);
          doc.text('CARDÁPIO DIGITAL', x + cardWidth / 2, curY, { align: 'center' });
          curY += density === 'compact' ? 3.5 : 4.5;

          // 2. Número da Mesa
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(density === 'compact' ? 12 : 14);
          doc.setTextColor(2, 6, 23);
          doc.text(`Mesa ${t.tableNumber}`, x + cardWidth / 2, curY, { align: 'center' });
          curY += density === 'compact' ? 3 : 3.8;

          if (t.name) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(density === 'compact' ? 5.5 : 6.5);
            doc.setTextColor(100, 116, 139);
            doc.text(t.name.slice(0, 22), x + cardWidth / 2, curY, { align: 'center' });
            curY += density === 'compact' ? 2.5 : 3;
          } else {
            curY += 0.5;
          }

          // 3. QR Code Nítido com margem de silêncio
          const qrSize = density === 'compact' ? 21 : 26;
          const qrX = x + (cardWidth - qrSize) / 2;
          const qrY = curY;

          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.2);
          doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'S');

          if (qrDataUrl) {
            doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
          }
          curY += qrSize + (density === 'compact' ? 2.5 : 3.5);

          // 4. Instruções de Leitura
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(density === 'compact' ? 6 : 7);
          doc.setTextColor(15, 23, 42);
          doc.text('Aponte a câmera do celular', x + cardWidth / 2, curY, { align: 'center' });
          curY += 2.2;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(density === 'compact' ? 5 : 5.8);
          doc.setTextColor(100, 116, 139);
          doc.text('Faça seus pedidos direto na mesa', x + cardWidth / 2, curY, { align: 'center' });
        }

        doc.save(`cartoes-mesas-${tenant?.slug || 'restaurante'}.pdf`);
      }
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar arquivo PDF. Você também pode utilizar o botão "Imprimir (A4)".');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs animate-in fade-in print-qr-overlay">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[94vh] print-qr-container">
        {/* Header (Oculto na impressão) */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  {mode === 'single' && table
                    ? `QR Code da Mesa ${table.tableNumber}`
                    : 'Impressão de QR Codes das Mesas'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-[10px] font-bold text-slate-700">
                  A4 Retrato
                </span>
                {loadingFreshTables && (
                  <span className="text-[10px] text-indigo-600 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando mesas...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === 'single'
                  ? 'Exiba o display na mesa ou baixe o PDF pronto para recorte'
                  : 'Gere cartões diagramados em grade de 3 colunas por folha A4'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {totalRegisteredCount > 0 && (
              <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-semibold">
                {table && (
                  <button
                    onClick={() => setMode('single')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      mode === 'single' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600'
                    }`}
                  >
                    Mesa Individual
                  </button>
                )}
                <button
                  onClick={() => setMode('batch')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    mode === 'batch' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600'
                  }`}
                >
                  Lote ({totalRegisteredCount} mesas)
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Batch Controls Toolbar (Oculto na impressão) */}
        {mode === 'batch' && (
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden shrink-0 print-controls-bar">
            {/* Left: Filtro e Seleção */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Segmented Filter: Todas as mesas vs Apenas ativas */}
              <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({totalRegisteredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('active')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterMode === 'active'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={inactiveCount > 0 ? `${inactiveCount} inativas ocultadas` : 'Apenas mesas ativas'}
                >
                  Ativas ({activeCount})
                </button>
              </div>

              <span className="font-bold text-slate-700 text-xs">
                <span className="text-indigo-600 font-extrabold">{selectedTablesList.length}</span> de{' '}
                {eligibleTables.length} selecionadas
              </span>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                <span>Selecionar Todas ({eligibleTables.length})</span>
              </button>

              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            </div>

            {/* Right: Densidade de Grade e Folhas A4 */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium">Densidade A4:</span>
              <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDensity('standard')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    density === 'standard' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-600'
                  }`}
                  title="9 cartões por página (3 colunas x 3 linhas) - Tamanho ideal para displays de mesa"
                >
                  Padrão (9 / pág)
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    density === 'compact' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-600'
                  }`}
                  title="12 cartões por página (3 colunas x 4 linhas) - Mais econômico em papel comum"
                >
                  Compacto (12 / pág)
                </button>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-100 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {totalPagesCount} {totalPagesCount === 1 ? 'folha A4' : 'folhas A4'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body / Printable Canvas */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/60 print:bg-transparent print:p-0 print:m-0 print:overflow-visible print-qr-body">
          {mode === 'single' && table ? (
            /* ================================================================
               MODO INDIVIDUAL (Display de 1 Mesa)
               ================================================================ */
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="print-card-item p-6 sm:p-8 bg-white border-2 border-slate-900 rounded-3xl max-w-sm w-full shadow-lg text-center flex flex-col items-center mx-auto">
                {/* Logo da Empresa com proporção preservada */}
                {logoUrl ? (
                  <div className="h-14 max-w-[180px] flex items-center justify-center mb-1">
                    <img
                      src={logoUrl}
                      alt={tenant?.name || 'Logo'}
                      className="max-h-full max-w-full object-contain"
                      loading="eager"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-800 mb-1">
                    <UtensilsCrossed className="w-5 h-5 text-slate-600" />
                    <span className="text-sm font-black uppercase tracking-wider">
                      {tenant?.name || 'Restaurante'}
                    </span>
                  </div>
                )}

                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Cardápio Digital
                </span>

                <div className="mt-1 mb-3">
                  <span className="text-3xl font-black text-slate-950 block leading-tight">
                    Mesa {table.tableNumber}
                  </span>
                  {table.name && (
                    <span className="text-xs text-slate-600 font-semibold">{table.name}</span>
                  )}
                </div>

                {singleQrUrl ? (
                  <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs mb-3">
                    <img
                      src={singleQrUrl}
                      alt={`QR Code Mesa ${table.tableNumber}`}
                      className="w-48 h-48 rounded-lg object-contain block"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-xs text-slate-400 mb-3">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Gerando QR Code...
                  </div>
                )}

                <div className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  Aponte a câmera do celular
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Faça seus pedidos direto na mesa
                </div>
              </div>

              {/* Link Box */}
              <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-xs print:hidden">
                <span className="text-xs text-slate-600 truncate font-mono select-all">
                  {currentTableUrl}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleCopyLink}
                    className="p-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Copiar link"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                  <a
                    href={currentTableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Abrir no navegador"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Regenerar Token */}
              <div className="print:hidden">
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={regenerating}
                  className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  Regerar código de segurança do QR Code
                </button>
              </div>
            </div>
          ) : (
            /* ================================================================
               MODO LOTE (Grade de 3 Colunas com Paginação A4 Rigorosa)
               ================================================================ */
            <div className="space-y-8 print:space-y-0">
              {selectedTablesList.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                  <QrCode className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-700">Nenhuma mesa selecionada</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Marque as mesas desejadas ou clique em &quot;Selecionar Todas&quot; para imprimir.
                  </p>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Selecionar Todas ({eligibleTables.length})
                  </button>
                </div>
              ) : (
                pagedTables.map((pageTables, pageIndex) => (
                  <div
                    key={`page-${pageIndex}`}
                    className="print-page bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/80 print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none relative"
                  >
                    {/* Indicador visual de folha A4 no preview de tela (oculto na impressão) */}
                    <div className="mb-3 pb-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 print:hidden font-medium">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">
                          Folha {pageIndex + 1} de {totalPagesCount}
                        </span>
                        <span>•</span>
                        <span>
                          {pageTables.length} {pageTables.length === 1 ? 'cartão' : 'cartões'} nesta página
                          (Mesas {pageTables[0]?.tableNumber} a {pageTables[pageTables.length - 1]?.tableNumber})
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">Padrão A4 Retrato (3 colunas)</span>
                    </div>

                    {/* Grade de 3 Colunas Exatas por Página A4 */}
                    <div className="print-grid-3cols grid grid-cols-3 gap-3 sm:gap-4 print:gap-3">
                      {pageTables.map((t) => {
                        const qr = batchQrUrls[t.id];
                        const isSelected = selectedTableIds.includes(t.id);

                        return (
                          <div
                            key={t.id}
                            className={`print-card-item relative bg-white border-2 border-slate-900 rounded-2xl text-center flex flex-col items-center justify-between transition-all ${
                              density === 'compact'
                                ? 'print-card-compact h-[56mm] min-h-[56mm] max-h-[56mm] p-2'
                                : 'print-card-standard h-[76mm] min-h-[76mm] max-h-[76mm] p-2.5'
                            }`}
                          >
                            {/* Checkbox de seleção rápida na tela (oculto na impressão) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTableSelection(t.id);
                              }}
                              className="absolute top-1.5 right-1.5 p-1 text-slate-300 hover:text-indigo-600 rounded-md print:hidden cursor-pointer"
                              title="Incluir/Desmarcar da impressão"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>

                            {/* Topo do Cartão: Logo com proporção perfeita sem sobrepor texto */}
                            <div className="flex flex-col items-center w-full px-1">
                              {logoUrl ? (
                                <div className={`${density === 'compact' ? 'h-6 max-w-[85px]' : 'h-8 max-w-[105px]'} flex items-center justify-center mb-0.5`}>
                                  <img
                                    src={logoUrl}
                                    alt={tenant?.name || 'Logo'}
                                    className="max-h-full max-w-full object-contain"
                                    loading="eager"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-slate-800 mb-0.5">
                                  <UtensilsCrossed className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-[9.5px] font-black uppercase tracking-wider truncate max-w-[130px]">
                                    {tenant?.name || 'Restaurante'}
                                  </span>
                                </div>
                              )}

                              <span className="text-[7.5px] font-bold uppercase tracking-wider text-slate-500 truncate max-w-[130px] block leading-tight mb-1">
                                Cardápio Digital
                              </span>

                              {/* Identificação da Mesa */}
                              <div className="leading-tight">
                                <span
                                  className={`${
                                    density === 'compact' ? 'text-sm' : 'text-base sm:text-lg'
                                  } font-black text-slate-950 block leading-tight tracking-tight`}
                                >
                                  Mesa {t.tableNumber}
                                </span>
                                {t.name && (
                                  <span className="text-[8px] text-slate-500 font-semibold truncate max-w-[125px] block mt-0.5">
                                    {t.name}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Centro: QR Code Nítido com Área de Silêncio */}
                            <div className="my-1 flex items-center justify-center shrink-0">
                              {qr ? (
                                <div className="p-1 bg-white rounded-lg border border-slate-300 shadow-2xs">
                                  <img
                                    src={qr}
                                    alt={`Mesa ${t.tableNumber}`}
                                    className={`${
                                      density === 'compact'
                                        ? 'w-18 h-18 sm:w-19 sm:h-19'
                                        : 'w-24 h-24 sm:w-26 sm:h-26'
                                    } object-contain rounded-xs block`}
                                    loading="eager"
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`${
                                    density === 'compact' ? 'w-18 h-18' : 'w-24 h-24'
                                  } bg-slate-100 rounded-lg flex items-center justify-center text-[9px] text-slate-400`}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> Gerando...
                                </div>
                              )}
                            </div>

                            {/* Rodapé do Cartão: Instruções de Leitura */}
                            <div className="w-full px-1">
                              <span className="text-[8px] font-black text-slate-900 uppercase tracking-tight block leading-tight">
                                Aponte a câmera do celular
                              </span>
                              <span className="text-[7px] text-slate-500 mt-0.5 block leading-none">
                                Faça seus pedidos direto na mesa
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer Actions (Oculto na impressão) */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0 print-controls-bar">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>

            {mode === 'batch' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>
                  Configurado para folha A4 retrato ({totalPagesCount} {totalPagesCount === 1 ? 'página' : 'páginas'})
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'single' && (
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-4 h-4" />
                <span>PNG</span>
              </button>
            )}

            {/* BOTÃO DIRETO DE BAIXAR PDF (A4) - Funciona 100% no celular Android/iOS */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={
                generatingBatch ||
                downloadingPdf ||
                (mode === 'batch' && selectedTablesList.length === 0)
              }
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar arquivo PDF com todas as folhas A4 prontas"
            >
              {downloadingPdf ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>
                    {mode === 'single'
                      ? 'Baixar PDF da Mesa'
                      : `Baixar PDF (${selectedTablesList.length} ${
                          selectedTablesList.length === 1 ? 'mesa' : 'mesas'
                        })`}
                  </span>
                </>
              )}
            </button>

            {/* BOTÃO IMPRIMIR NATIVO (A4) */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={
                generatingBatch ||
                !logoLoaded ||
                (mode === 'batch' && selectedTablesList.length === 0)
              }
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingBatch ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Gerando QR Codes...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Imprimir (A4)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
