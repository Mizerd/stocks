import type { ExchangeId, Instrument, Listing, ProviderId, Region, Sector } from './types';

function stock(
  symbol: string, name: string, exchange: ExchangeId, currency: string, region: Region,
  sector: Sector, provider: ProviderId, providerId: string, wiki?: string,
): Instrument {
  return { symbol, name, kind: 'stock', exchange, currency, region, sector, provider, providerId, wiki };
}

function index(
  symbol: string, name: string, exchange: ExchangeId, currency: string, region: Region,
  provider: ProviderId, providerId: string,
): Instrument {
  return { symbol, name, kind: 'index', exchange, currency, region, provider, providerId };
}

// Hand-checked stocks. The worker adds every other stock of the markets' bulk lists (worker/universe.ts);
// a stock listed here keeps this name, sector and Wikipedia title. Euronext publishes no sectors in bulk,
// so its stocks are covered only when listed here. Provider identifiers:
// nasdaq = ticker, nordic = orderbook id, euronext = ISIN-MIC, baltic = ISIN.
// The last value is the English Wikipedia article title, used for the company summary.
export const STOCKS: Instrument[] = [
  stock('AAPL', 'Apple', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'AAPL', 'Apple Inc.'),
  stock('MSFT', 'Microsoft', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'MSFT', 'Microsoft'),
  stock('NVDA', 'Nvidia', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'NVDA', 'Nvidia'),
  stock('AMD', 'Advanced Micro Devices', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'AMD', 'AMD'),
  stock('GOOGL', 'Alphabet', 'XNAS', 'USD', 'US', 'C', 'nasdaq', 'GOOGL', 'Alphabet Inc.'),
  stock('META', 'Meta Platforms', 'XNAS', 'USD', 'US', 'C', 'nasdaq', 'META', 'Meta Platforms'),
  stock('AMZN', 'Amazon', 'XNAS', 'USD', 'US', 'D', 'nasdaq', 'AMZN', 'Amazon (company)'),
  stock('TSLA', 'Tesla', 'XNAS', 'USD', 'US', 'D', 'nasdaq', 'TSLA', 'Tesla, Inc.'),
  stock('KO', 'Coca-Cola', 'XNYS', 'USD', 'US', 'S', 'nasdaq', 'KO', 'The Coca-Cola Company'),
  stock('JPM', 'JPMorgan Chase', 'XNYS', 'USD', 'US', 'F', 'nasdaq', 'JPM', 'JPMorgan Chase'),
  stock('V', 'Visa', 'XNYS', 'USD', 'US', 'F', 'nasdaq', 'V', 'Visa Inc.'),
  stock('XOM', 'Exxon Mobil', 'XNYS', 'USD', 'US', 'E', 'nasdaq', 'XOM', 'ExxonMobil'),
  stock('JNJ', 'Johnson & Johnson', 'XNYS', 'USD', 'US', 'H', 'nasdaq', 'JNJ', 'Johnson & Johnson'),

  stock('ASML.AS', 'ASML Holding', 'XAMS', 'EUR', 'EU', 'T', 'euronext', 'NL0010273215-XAMS', 'ASML'),
  stock('SHELL.AS', 'Shell', 'XAMS', 'EUR', 'EU', 'E', 'euronext', 'GB00BP6MXD84-XAMS', 'Shell plc'),
  stock('INGA.AS', 'ING Groep', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0011821202-XAMS', 'ING Group'),
  stock('HEIA.AS', 'Heineken', 'XAMS', 'EUR', 'EU', 'S', 'euronext', 'NL0000009165-XAMS', 'Heineken N.V.'),
  stock('MC.PA', 'LVMH', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000121014-XPAR', 'LVMH'),
  stock('AIR.PA', 'Airbus', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'NL0000235190-XPAR', 'Airbus'),
  stock('OR.PA', "L'Oréal", 'XPAR', 'EUR', 'EU', 'S', 'euronext', 'FR0000120321-XPAR', "L'Oréal"),
  stock('TTE.PA', 'TotalEnergies', 'XPAR', 'EUR', 'EU', 'E', 'euronext', 'FR0000120271-XPAR', 'TotalEnergies'),
  stock('SAN.PA', 'Sanofi', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0000120578-XPAR', 'Sanofi'),
  // SAP's home listing is Xetra, which has no keyless public feed. This is its Euronext Milan (EuroTLX) line.
  stock('ADYEN.AS', 'Adyen', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0012969182-XAMS'),
  stock('ABN.AS', 'ABN AMRO', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0011540547-XAMS'),
  stock('AGN.AS', 'Aegon', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'BMG0112X1056-XAMS'),
  stock('NN.AS', 'NN Group', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0010773842-XAMS'),
  stock('ASRNL.AS', 'a.s.r. Nederland', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0011872643-XAMS'),
  stock('EXO.AS', 'Exor', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0012059018-XAMS'),
  stock('AD.AS', 'Ahold Delhaize', 'XAMS', 'EUR', 'EU', 'S', 'euronext', 'NL0011794037-XAMS'),
  stock('AKZA.AS', 'Akzo Nobel', 'XAMS', 'EUR', 'EU', 'M', 'euronext', 'NL0013267909-XAMS'),
  stock('DSFIR.AS', 'DSM-Firmenich', 'XAMS', 'EUR', 'EU', 'M', 'euronext', 'CH1216478797-XAMS'),
  stock('IMCD.AS', 'IMCD', 'XAMS', 'EUR', 'EU', 'M', 'euronext', 'NL0010801007-XAMS'),
  stock('MT.AS', 'ArcelorMittal', 'XAMS', 'EUR', 'EU', 'M', 'euronext', 'LU1598757687-XAMS'),
  stock('ASM.AS', 'ASM International', 'XAMS', 'EUR', 'EU', 'T', 'euronext', 'NL0000334118-XAMS'),
  stock('BESI.AS', 'BE Semiconductor', 'XAMS', 'EUR', 'EU', 'T', 'euronext', 'NL0012866412-XAMS'),
  stock('KPN.AS', 'KPN', 'XAMS', 'EUR', 'EU', 'C', 'euronext', 'NL0000009082-XAMS'),
  stock('PRX.AS', 'Prosus', 'XAMS', 'EUR', 'EU', 'C', 'euronext', 'NL0013654783-XAMS'),
  stock('REN.AS', 'RELX', 'XAMS', 'EUR', 'EU', 'C', 'euronext', 'GB00B2B0DG97-XAMS'),
  stock('WKL.AS', 'Wolters Kluwer', 'XAMS', 'EUR', 'EU', 'C', 'euronext', 'NL0000395903-XAMS'),
  stock('PHIA.AS', 'Philips', 'XAMS', 'EUR', 'EU', 'H', 'euronext', 'NL0000009538-XAMS'),
  stock('RAND.AS', 'Randstad', 'XAMS', 'EUR', 'EU', 'I', 'euronext', 'NL0000379121-XAMS'),
  stock('LIGHT.AS', 'Signify', 'XAMS', 'EUR', 'EU', 'I', 'euronext', 'NL0011821392-XAMS'),
  stock('CTPNV.AS', 'CTP', 'XAMS', 'EUR', 'EU', 'R', 'euronext', 'NL00150006R6-XAMS'),
  stock('ECMPA.AS', 'Eurocommercial Properties', 'XAMS', 'EUR', 'EU', 'R', 'euronext', 'NL0015000K93-XAMS'),
  stock('AI.PA', 'Air Liquide', 'XPAR', 'EUR', 'EU', 'M', 'euronext', 'FR0000120073-XPAR'),
  stock('AKE.PA', 'Arkema', 'XPAR', 'EUR', 'EU', 'M', 'euronext', 'FR0010313833-XPAR'),
  stock('BNP.PA', 'BNP Paribas', 'XPAR', 'EUR', 'EU', 'F', 'euronext', 'FR0000131104-XPAR'),
  stock('CS.PA', 'AXA', 'XPAR', 'EUR', 'EU', 'F', 'euronext', 'FR0000120628-XPAR'),
  stock('ACA.PA', 'Crédit Agricole', 'XPAR', 'EUR', 'EU', 'F', 'euronext', 'FR0000045072-XPAR'),
  stock('GLE.PA', 'Société Générale', 'XPAR', 'EUR', 'EU', 'F', 'euronext', 'FR0000130809-XPAR'),
  stock('AMUN.PA', 'Amundi', 'XPAR', 'EUR', 'EU', 'F', 'euronext', 'FR0004125920-XPAR'),
  stock('RMS.PA', 'Hermès', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000052292-XPAR'),
  stock('KER.PA', 'Kering', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000121485-XPAR'),
  stock('RNO.PA', 'Renault', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000131906-XPAR'),
  stock('ML.PA', 'Michelin', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR001400AJ45-XPAR'),
  stock('AC.PA', 'Accor', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000120404-XPAR'),
  stock('SW.PA', 'Sodexo', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000121220-XPAR'),
  stock('BN.PA', 'Danone', 'XPAR', 'EUR', 'EU', 'S', 'euronext', 'FR0000120644-XPAR'),
  stock('RI.PA', 'Pernod Ricard', 'XPAR', 'EUR', 'EU', 'S', 'euronext', 'FR0000120693-XPAR'),
  stock('CA.PA', 'Carrefour', 'XPAR', 'EUR', 'EU', 'S', 'euronext', 'FR0000120172-XPAR'),
  stock('EL.PA', 'EssilorLuxottica', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0000121667-XPAR'),
  stock('ERF.PA', 'Eurofins Scientific', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0014000MR3-XPAR'),
  stock('BIM.PA', 'bioMérieux', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0013280286-XPAR'),
  stock('IPN.PA', 'Ipsen', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0010259150-XPAR'),
  stock('SU.PA', 'Schneider Electric', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000121972-XPAR'),
  stock('SAF.PA', 'Safran', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000073272-XPAR'),
  stock('DG.PA', 'Vinci', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000125486-XPAR'),
  stock('SGO.PA', 'Saint-Gobain', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000125007-XPAR'),
  stock('HO.PA', 'Thales', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000121329-XPAR'),
  stock('LR.PA', 'Legrand', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0010307819-XPAR'),
  stock('EN.PA', 'Bouygues', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0000120503-XPAR'),
  stock('ALO.PA', 'Alstom', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0010220475-XPAR'),
  stock('BVI.PA', 'Bureau Veritas', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'FR0006174348-XPAR'),
  stock('CAP.PA', 'Capgemini', 'XPAR', 'EUR', 'EU', 'T', 'euronext', 'FR0000125338-XPAR'),
  stock('DSY.PA', 'Dassault Systèmes', 'XPAR', 'EUR', 'EU', 'T', 'euronext', 'FR0014003TT8-XPAR'),
  stock('STMPA.PA', 'STMicroelectronics', 'XPAR', 'EUR', 'EU', 'T', 'euronext', 'NL0000226223-XPAR'),
  stock('ORA.PA', 'Orange', 'XPAR', 'EUR', 'EU', 'C', 'euronext', 'FR0000133308-XPAR'),
  stock('PUB.PA', 'Publicis Groupe', 'XPAR', 'EUR', 'EU', 'C', 'euronext', 'FR0000130577-XPAR'),
  stock('ENGI.PA', 'Engie', 'XPAR', 'EUR', 'EU', 'U', 'euronext', 'FR0010208488-XPAR'),
  stock('VIE.PA', 'Veolia', 'XPAR', 'EUR', 'EU', 'U', 'euronext', 'FR0000124141-XPAR'),
  stock('RUI.PA', 'Rubis', 'XPAR', 'EUR', 'EU', 'U', 'euronext', 'FR0013269123-XPAR'),
  stock('TE.PA', 'Technip Energies', 'XPAR', 'EUR', 'EU', 'E', 'euronext', 'NL0014559478-XPAR'),
  stock('VK.PA', 'Vallourec', 'XPAR', 'EUR', 'EU', 'E', 'euronext', 'FR0013506730-XPAR'),
  stock('URW.PA', 'Unibail-Rodamco-Westfield', 'XPAR', 'EUR', 'EU', 'R', 'euronext', 'FR0013326246-XPAR'),
  stock('GFC.PA', 'Gecina', 'XPAR', 'EUR', 'EU', 'R', 'euronext', 'FR0010040865-XPAR'),
  stock('LI.PA', 'Klépierre', 'XPAR', 'EUR', 'EU', 'R', 'euronext', 'FR0000121964-XPAR'),
  stock('COV.PA', 'Covivio', 'XPAR', 'EUR', 'EU', 'R', 'euronext', 'FR0000064578-XPAR'),
  stock('ENEL.MI', 'Enel', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0003128367-MTAA'),
  stock('TRN.MI', 'Terna', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0003242622-MTAA'),
  stock('SRG.MI', 'Snam', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0003153415-MTAA'),
  stock('IG.MI', 'Italgas', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0005211237-MTAA'),
  stock('A2A.MI', 'A2A', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0001233417-MTAA'),
  stock('HER.MI', 'Hera', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0001250932-MTAA'),
  stock('IRE.MI', 'Iren', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0003027817-MTAA'),
  stock('ACE.MI', 'Acea', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0001207098-MTAA'),
  stock('ERG.MI', 'ERG', 'XMIL', 'EUR', 'EU', 'U', 'euronext', 'IT0001157020-MTAA'),
  stock('ENI.MI', 'Eni', 'XMIL', 'EUR', 'EU', 'E', 'euronext', 'IT0003132476-MTAA'),
  stock('TEN.MI', 'Tenaris', 'XMIL', 'EUR', 'EU', 'E', 'euronext', 'LU2598331598-MTAA'),
  stock('SPM.MI', 'Saipem', 'XMIL', 'EUR', 'EU', 'E', 'euronext', 'IT0005495657-MTAA'),
  stock('ISP.MI', 'Intesa Sanpaolo', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0000072618-MTAA'),
  stock('UCG.MI', 'UniCredit', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0005239360-MTAA'),
  stock('G.MI', 'Generali', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0000062072-MTAA'),
  stock('MB.MI', 'Mediobanca', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0000062957-MTAA'),
  stock('BAMI.MI', 'Banco BPM', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0005218380-MTAA'),
  stock('PST.MI', 'Poste Italiane', 'XMIL', 'EUR', 'EU', 'F', 'euronext', 'IT0003796171-MTAA'),
  stock('RACE.MI', 'Ferrari', 'XMIL', 'EUR', 'EU', 'D', 'euronext', 'NL0011585146-MTAA'),
  stock('MONC.MI', 'Moncler', 'XMIL', 'EUR', 'EU', 'D', 'euronext', 'IT0004965148-MTAA'),
  stock('PIRC.MI', 'Pirelli', 'XMIL', 'EUR', 'EU', 'D', 'euronext', 'IT0005278236-MTAA'),
  stock('CPR.MI', 'Campari', 'XMIL', 'EUR', 'EU', 'S', 'euronext', 'NL0015435975-MTAA'),
  stock('REC.MI', 'Recordati', 'XMIL', 'EUR', 'EU', 'H', 'euronext', 'IT0003828271-MTAA'),
  stock('AMP.MI', 'Amplifon', 'XMIL', 'EUR', 'EU', 'H', 'euronext', 'IT0004056880-MTAA'),
  stock('DIA.MI', 'DiaSorin', 'XMIL', 'EUR', 'EU', 'H', 'euronext', 'IT0003492391-MTAA'),
  stock('LDO.MI', 'Leonardo', 'XMIL', 'EUR', 'EU', 'I', 'euronext', 'IT0003856405-MTAA'),
  stock('PRY.MI', 'Prysmian', 'XMIL', 'EUR', 'EU', 'I', 'euronext', 'IT0004176001-MTAA'),
  stock('TIT.MI', 'Telecom Italia', 'XMIL', 'EUR', 'EU', 'C', 'euronext', 'IT0005712671-MTAA'),
  stock('INW.MI', 'Inwit', 'XMIL', 'EUR', 'EU', 'C', 'euronext', 'IT0005090300-MTAA'),
  stock('NEXI.MI', 'Nexi', 'XMIL', 'EUR', 'EU', 'T', 'euronext', 'IT0005366767-MTAA'),
  stock('SAP.MI', 'SAP', 'XMIL', 'EUR', 'EU', 'T', 'euronext', 'DE0007164600-ETLX', 'SAP'),
  stock('NOVO-B.CO', 'Novo Nordisk', 'XCSE', 'DKK', 'EU', 'H', 'nordic', 'TX2178', 'Novo (company)'),
  stock('DSV.CO', 'DSV', 'XCSE', 'DKK', 'EU', 'I', 'nordic', 'TX2319', 'DSV (company)'),
  stock('NOKIA.HE', 'Nokia', 'XHEL', 'EUR', 'EU', 'T', 'nordic', 'TX50063', 'Nokia'),

  stock('IGN1L.VS', 'Ignitis grupė', 'XLIT', 'EUR', 'BAL', 'U', 'baltic', 'LT0000115768', 'Ignitis'),
  stock('TEL1L.VS', 'Telia Lietuva', 'XLIT', 'EUR', 'BAL', 'C', 'baltic', 'LT0000123911', 'Telia Lietuva'),
  stock('ROE1L.VS', 'Artea Bankas', 'XLIT', 'EUR', 'BAL', 'F', 'baltic', 'LT0000102253', 'Artea Bank'),
  stock('APG1L.VS', 'Apranga', 'XLIT', 'EUR', 'BAL', 'D', 'baltic', 'LT0000102337', 'Apranga Group'),
  // Akola has no English article; its Lithuanian one is wired up in worker/providers/wikipedia.ts.
  stock('AKO1L.VS', 'Akola Group', 'XLIT', 'EUR', 'BAL', 'S', 'baltic', 'LT0000128092'),
  stock('KNE1L.VS', 'KN Energies', 'XLIT', 'EUR', 'BAL', 'E', 'baltic', 'LT0000111650', 'KN Energies'),
  stock('GRG1L.VS', 'Grigeo Group', 'XLIT', 'EUR', 'BAL', 'M', 'baltic', 'LT0000102030', 'Grigeo AB'),
  stock('LHV1T.TL', 'LHV Group', 'XTAL', 'EUR', 'BAL', 'F', 'baltic', 'EE3100102203', 'LHV Pank'),
  stock('TAL1T.TL', 'Tallink Grupp', 'XTAL', 'EUR', 'BAL', 'D', 'baltic', 'EE3100004466', 'Tallink'),
];

export const INDICES: Instrument[] = [
  index('NDX', 'Nasdaq 100', 'XNAS', 'USD', 'US', 'nasdaq', 'NDX'),
  index('COMP', 'Nasdaq Composite', 'XNAS', 'USD', 'US', 'nasdaq', 'COMP'),
  index('N100', 'Euronext 100', 'XPAR', 'EUR', 'EU', 'euronext', 'FR0003502079-XPAR'),
  index('OMXVGI', 'OMX Vilnius', 'XLIT', 'EUR', 'BAL', 'baltic', 'OMXVGI'),
];

const ALL = [...STOCKS, ...INDICES];

// Old tickers and bare tickers people are likely to type or have bookmarked.
const ALIASES: Record<string, string> = {
  'SAB1L': 'ROE1L.VS', 'SAB1L.VS': 'ROE1L.VS', 'SAP': 'SAP.MI', 'SAP.DE': 'SAP.MI',
  'NVO': 'NOVO-B.CO', 'ASML': 'ASML.AS', 'LVMH': 'MC.PA',
};

// Resolves a symbol or alias against the catalogue and then the wider universe, when one is given.
export function findInstrument<T extends Listing = Instrument>(input: string, universe: readonly T[] = []): Instrument | T | undefined {
  const s = input.trim().toUpperCase();
  return (
    ALL.find((i) => i.symbol === s) ??
    ALL.find((i) => i.symbol === ALIASES[s]) ??
    universe.find((i) => i.symbol === s) ??
    ALL.find((i) => i.symbol.split('.')[0] === s)
  );
}

// The shape of every stock symbol the site uses: ticker, then the exchange suffix outside the US.
export const isSymbolShaped = (text: string) => /^[A-Z0-9][A-Z0-9-]{0,15}(\.[A-Z]{2})?$/.test(text);

// Funds have no ticker: their symbol is "FUND:" and the ISIN, which no stock symbol can look like.
export const FUND_PREFIX = 'FUND:';
export const isFundSymbol = (text: string) => /^FUND:[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(text);
export const fundSymbol = (isin: string) => FUND_PREFIX + isin;

// The fields the browser uses; the provider's identifier and the Wikipedia title stay on the server.
export function toListing(inst: Instrument): Listing {
  const { symbol, name, kind, exchange, currency, region, sector, provider, company, category } = inst;
  return kind === 'fund'
    ? { symbol, name, kind, exchange, currency, region, provider, company, category }
    : { symbol, name, kind, exchange, currency, region, sector, provider };
}

// Ticker as printed in tables: without the exchange suffix. A fund shows its ISIN.
export const shortSymbol = (symbol: string) =>
  symbol.startsWith(FUND_PREFIX) ? symbol.slice(FUND_PREFIX.length) : symbol.split('.')[0];
