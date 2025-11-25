import { useState } from 'react';
import { Settings, Briefcase, TrendingUp, AlertTriangle } from 'lucide-react';

import './App.css';

// --- Configurações Iniciais e Constantes ---

// Adicionamos 'maturityYears' para calcular a Marcação a Mercado (Duration)
// Short Term (CP) tem vencimento curto, sofre menos impacto.
// Long Term (LP, 2050, 2065) tem vencimento longo, sofre MUITO impacto.
const INITIAL_ASSETS = [
  { id: 'pos', name: 'Pós Fixado', type: 'pos', rate: 100, color: 'bg-slate-200', maturityYears: 2 },
  { id: 'ipca_2050', name: 'IPCA +2050', type: 'ipca_long', rate: 6.2, color: 'bg-orange-100', maturityYears: 25 },
  { id: 'renda_2065', name: 'RENDA +2065', type: 'ipca_long', rate: 6.4, color: 'bg-orange-200', maturityYears: 40 },
  { id: 'ipca_cp', name: 'IPCA+ CP', type: 'ipca_short', rate: 5.8, color: 'bg-yellow-100', maturityYears: 2 },
  { id: 'pre_cp', name: 'PREFIXADO CP', type: 'pre', rate: 10.5, color: 'bg-blue-100', maturityYears: 3 },
  { id: 'pre_lp', name: 'PREFIXADO LP', type: 'pre_long', rate: 11.8, color: 'bg-blue-200', maturityYears: 10 },
];

const INITIAL_SCENARIOS = [
  { id: 1, label: 'Péssimo', inflation: 8.99, color: 'bg-red-600 text-white', tone: 'red' },
  { id: 2, label: 'Muito ruim', inflation: 8.28, color: 'bg-red-500 text-white', tone: 'red' },
  { id: 3, label: 'Ruim', inflation: 7.57, color: 'bg-orange-500 text-white', tone: 'orange' },
  { id: 4, label: 'Igual', inflation: 6.87, color: 'bg-amber-400 text-slate-900', tone: 'amber' },
  { id: 5, label: 'Ok', inflation: 6.16, color: 'bg-yellow-300 text-slate-900', tone: 'yellow' },
  { id: 6, label: 'Bom', inflation: 5.45, color: 'bg-lime-400 text-slate-900', tone: 'lime' },
  { id: 7, label: 'Muito Bom', inflation: 4.74, color: 'bg-green-400 text-slate-900', tone: 'green' },
  { id: 8, label: 'Excelente', inflation: 4.03, color: 'bg-emerald-400 text-white', tone: 'emerald' },
  { id: 9, label: 'Praia', inflation: 3.33, color: 'bg-teal-500 text-white', tone: 'teal' },
];

const REAL_INTEREST_RATE = 4.0;

/**
 * Define a Taxa de Juro Real exigida pelo mercado baseada na inflação (Risco Brasil).
 * Inflação Alta (Péssimo) -> Risco Alto -> Mercado exige prêmio (ex: IPCA + 9%)
 * Inflação Baixa (Praia) -> Risco Baixo -> Mercado aceita menos (ex: IPCA + 3%)
 */
const getMarketRealRate = (inflation) => {
  // Interpolação linear simples:
  // Inflação 3.33% (Praia) -> Taxa Real 3.0%
  // Inflação 8.99% (Péssimo) -> Taxa Real 9.0%

  const minInf = 3.33;
  const maxInf = 8.99;
  const minRate = 3.0; // IPCA + 3%
  const maxRate = 9.0; // IPCA + 9%

  if (inflation <= minInf) return minRate;
  if (inflation >= maxInf) return maxRate;

  const ratio = (inflation - minInf) / (maxInf - minInf);
  return minRate + ratio * (maxRate - minRate);
};

// --- Componentes UI ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
    {children}
  </div>
);

// --- Lógica de Cálculo ---

/**
 * Calcula o retorno NOMINAL acumulado considerando Marcação a Mercado para Títulos Longos
 */
const calculateNominalReturn = (asset, scenarioInflation, years, realRateBase) => {
  const inflationDec = scenarioInflation / 100;

  // 1. Títulos Pós-Fixados (CDI) e Curtos
  // Eles sofrem pouco com marcação a mercado ou são levados ao vencimento.
  // Usamos cálculo de "Curva" (Acumulação simples).
  if (asset.type === 'pos' || asset.type === 'ipca_short' || asset.type === 'pre') {
    let annualRate = 0;
    if (asset.type === 'pre') {
      annualRate = asset.rate / 100;
    } else if (asset.type === 'ipca_short') {
      annualRate = (1 + inflationDec) * (1 + asset.rate / 100) - 1;
    } else if (asset.type === 'pos') {
      const estimatedCDI = (1 + inflationDec) * (1 + realRateBase / 100) - 1;
      annualRate = estimatedCDI * (asset.rate / 100);
    }
    return Math.pow(1 + annualRate, years) - 1;
  }

  // 2. Títulos Longos (IPCA Longo, Pre Longo)
  // Sujeitos à Marcação a Mercado Violenta.
  // Fórmula: Preço Venda / Preço Compra - 1

  // Taxa Contratada (que eu tenho no papel)
  const contractedRate = asset.rate / 100;

  // Taxa de Mercado no Cenário Futuro (Yield Curve)
  // Se a inflação é alta, mercado exige taxa maior.
  const marketRealRate = getMarketRealRate(scenarioInflation) / 100;

  // Tempo restante até o vencimento no momento da venda
  const remainingTime = Math.max(0, asset.maturityYears - years);

  // Inflação acumulada no período que fiquei com o título
  const accumulatedInflation = Math.pow(1 + inflationDec, years);

  let priceRatio = 1;

  if (asset.type === 'ipca_long') {
    // Lógica simplificada de PU (Preço Unitário) NTN-B
    // Retorno = (Inflação Acumulada) * (Ganho/Perda de Taxa)

    // Fator de Desconto da Compra (Preço Teórico Original)
    // Considerando que comprei a "par" (taxa contratada = taxa mercado naquele dia)
    // Mas simplificando: O ganho vem da diferença entre (1+Contratada) e (1+Mercado) trazida a valor presente pelo tempo restante.

    const rateFactor = Math.pow((1 + contractedRate) / (1 + marketRealRate), remainingTime);
    const accrualFactor = Math.pow(1 + contractedRate, years); // O ganho do cupom no tempo que passou

    // O retorno total é a Inflação * O Juro Acumulado * O Choque de Taxa (Marcação)
    // Se MarketRate > ContractedRate, o rateFactor < 1 (Prejuízo no principal)

    // Ajuste: A fórmula exata aproximada de retorno total
    const totalGrowth = accumulatedInflation * Math.pow(1 + contractedRate, years) * Math.pow((1 + contractedRate) / (1 + marketRealRate), remainingTime);
    return totalGrowth - 1;

  } else if (asset.type === 'pre_long') {
    // Prefixado Longo (LTN / NTN-F)
    // Inflação impacta a expectativa da taxa prefixada de mercado.
    // Taxa Pré Mercado = Inflação Cenário + Juro Real Cenário
    const marketPreRate = (1 + inflationDec) * (1 + marketRealRate) - 1;

    const totalGrowth = Math.pow(1 + contractedRate, years) * Math.pow((1 + contractedRate) / (1 + marketPreRate), remainingTime);
    return totalGrowth - 1;
  }

  return 0;
};

const calculateRealReturn = (nominalReturn, scenarioInflation, years) => {
  const accumulatedInflation = Math.pow(1 + (scenarioInflation / 100), years) - 1;
  const realReturn = ((1 + nominalReturn) / (1 + accumulatedInflation)) - 1;
  return realReturn;
};

// --- Componente Principal ---

export default function App() {
  const [years, setYears] = useState(1);
  const [assets, setAssets] = useState(INITIAL_ASSETS);
  const [scenarios, setScenarios] = useState(INITIAL_SCENARIOS);
  const [allocation, setAllocation] = useState({
    'pos': 20, 'ipca_2050': 10, 'renda_2065': 10,
    'ipca_cp': 20, 'pre_cp': 20, 'pre_lp': 20
  });
  const [showSettings, setShowSettings] = useState(false);
  const [realInterest, setRealInterest] = useState(REAL_INTEREST_RATE);
  const [viewMode, setViewMode] = useState('nominal');

  const handleAllocationChange = (id, val) => {
    setAllocation(prev => ({ ...prev, [id]: parseInt(val) }));
  };

  const totalAllocation = Object.values(allocation).reduce((a, b) => a + b, 0);

  const handleAssetRateChange = (id, val) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, rate: parseFloat(val) || 0 } : a));
  };
  const handleScenarioInflationChange = (id, val) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, inflation: parseFloat(val) || 0 } : s));
  };

  const getFormattedValue = (asset, scenario) => {
    const nominal = calculateNominalReturn(asset, scenario.inflation, years, realInterest);

    if (viewMode === 'nominal') {
      return { value: nominal, text: (nominal * 100).toFixed(2) + '%' };
    } else {
      const real = calculateRealReturn(nominal, scenario.inflation, years);
      return { value: real, text: (real * 100).toFixed(2) + '%' };
    }
  };

  const getWalletValue = (scenario) => {
    let weightedNominalReturn = 0;
    const totalAlloc = totalAllocation || 1;

    assets.forEach(asset => {
      const r = calculateNominalReturn(asset, scenario.inflation, years, realInterest);
      const w = allocation[asset.id] || 0;
      weightedNominalReturn += (r * w);
    });

    const finalNominal = weightedNominalReturn / totalAlloc;

    if (viewMode === 'nominal') {
      return { value: finalNominal, text: (finalNominal * 100).toFixed(2) + '%' };
    } else {
      const finalReal = calculateRealReturn(finalNominal, scenario.inflation, years);
      return { value: finalReal, text: (finalReal * 100).toFixed(2) + '%' };
    }
  };

  // Helper para mostrar a taxa de mercado do cenário (Tooltip)
  const getScenarioYield = (inflation) => {
    const real = getMarketRealRate(inflation);
    return `Mercado exige IPCA + ${real.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans text-slate-900">

      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight hidden sm:block">Simulador de Renda Fixa</h1>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight sm:hidden">Simulador</h1>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-6">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button onClick={() => setViewMode('nominal')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${viewMode === 'nominal' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Nominal</button>
              <button onClick={() => setViewMode('real')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'real' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Real <span className="text-[10px] opacity-75">(vs IPCA)</span></button>
            </div>

            <div className="bg-slate-100 p-1 rounded-lg flex text-sm font-medium">
              {[1, 3, 5, 10].map(y => (
                <button key={y} onClick={() => setYears(y)} className={`px-2 sm:px-3 py-1.5 rounded-md transition-all text-xs sm:text-sm ${years === y ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{y} Ano{y > 1 ? 's' : ''}</button>
              ))}
            </div>

            <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-100'}`} title="Ajustar Premissas">
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="bg-slate-50 border-b border-slate-200 animate-in slide-in-from-top-2 duration-200">
          <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Taxas dos Ativos (Anual)</h3>
              <div className="grid grid-cols-2 gap-4">
                {assets.map(asset => (
                  <div key={asset.id} className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">{asset.name}</label>
                    <div className="flex items-center">
                      <input type="number" step="0.1" value={asset.rate} onChange={(e) => handleAssetRateChange(asset.id, e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      <span className="ml-2 text-xs text-slate-400">{asset.type === 'pos' ? '% CDI' : '%'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Inflação por Cenário (%)</h3>
              <div className="grid grid-cols-3 gap-3">
                {scenarios.map(scen => (
                  <div key={scen.id}>
                    <label className={`text-[10px] uppercase font-bold px-1 rounded ${scen.color.replace('text-white', 'text-white/90').replace('text-slate-900', 'text-slate-700')}`}>{scen.label}</label>
                    <input type="number" step="0.01" value={scen.inflation} onChange={(e) => handleScenarioInflationChange(scen.id, e.target.value)} className="w-full mt-1 border border-slate-300 rounded px-2 py-1 text-sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Alerta Educativo */}
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex items-start gap-3">
          <AlertTriangle className="text-indigo-600 shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-indigo-900">
            <strong className="block font-semibold mb-1">Marcação a Mercado Ativada</strong>
            Para títulos longos (IPCA+ 2050, Renda+), cenários de inflação alta aumentam as taxas exigidas pelo mercado (Yield), desvalorizando o preço do título se vendido antecipadamente.
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-4 bg-slate-50 font-semibold text-slate-500 uppercase text-xs sticky left-0 z-10 border-b border-r border-slate-200 min-w-[140px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Ativo
                  </th>
                  {scenarios.map(scen => (
                    <th key={scen.id} className={`px-2 py-3 text-center min-w-[90px] ${scen.color} group relative`}>
                      <div className="text-xs font-semibold opacity-90">{scen.label}</div>
                      <div className="text-[10px] font-normal opacity-75 mt-0.5">IPCA {scen.inflation}%</div>

                      {/* Tooltip com taxa de mercado */}
                      <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap pointer-events-none transition-opacity z-20">
                        {getScenarioYield(scen.inflation)}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map(asset => (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 bg-white sticky left-0 border-r border-slate-200 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <div className="flex flex-col">
                        <span>{asset.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {asset.type.includes('ipca') ? `IPCA + ${asset.rate}%` : asset.type === 'pos' ? `${asset.rate}% CDI` : `${asset.rate}% a.a.`}
                        </span>
                      </div>
                    </td>
                    {scenarios.map(scen => {
                      const { value, text } = getFormattedValue(asset, scen);
                      // Se for negativo (Nominal ou Real), fica vermelho
                      const isNegative = value < 0;

                      return (
                        <td key={scen.id} className={`px-2 py-3 text-center font-mono ${isNegative ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                  <td className="px-4 py-4 bg-slate-900 sticky left-0 z-10 border-r border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center space-x-2">
                      <Briefcase size={16} className="text-emerald-400" />
                      <span>Sua Carteira</span>
                    </div>
                  </td>
                  {scenarios.map(scen => {
                    const { value, text } = getWalletValue(scen);
                    const isNegative = value < 0;

                    return (
                      <td key={scen.id} className={`px-2 py-4 text-center font-mono ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-slate-500 px-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 mr-1.5"></span>
              Valores negativos = Perda de capital (Desvalorização do título)
            </span>
          </div>
          <div className="flex flex-wrap gap-4 justify-end">
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div> Prefixado (Ganha na baixa inflação)</span>
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-orange-400 mr-2"></div> IPCA+ (Proteção Longa)</span>
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-slate-400 mr-2"></div> Pós (Estável)</span>
          </div>
        </div>

      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center">
              Simular Carteira
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${totalAllocation === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                Total: {totalAllocation}%
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {assets.map(asset => (
              <div key={asset.id} className="flex flex-col space-y-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-semibold text-slate-600 truncate max-w-[80px]" title={asset.name}>{asset.name}</label>
                  <span className="text-xs font-mono text-indigo-600">{allocation[asset.id]}%</span>
                </div>
                <input type="range" min="0" max="100" value={allocation[asset.id]} onChange={(e) => handleAllocationChange(asset.id, e.target.value)} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600" />
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}