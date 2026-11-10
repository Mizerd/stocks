import type { ExchangeId, Instrument, ProviderId, Region, Sector } from './types';

function stock(
  symbol: string, name: string, exchange: ExchangeId, currency: string, region: Region,
  sector: Sector, provider: ProviderId, providerId: string,
): Instrument {
  return { symbol, name, kind: 'stock', exchange, currency, region, sector, provider, providerId };
}

function index(
  symbol: string, name: string, exchange: ExchangeId, currency: string, region: Region,
  provider: ProviderId, providerId: string,
): Instrument {
  return { symbol, name, kind: 'index', exchange, currency, region, provider, providerId };
}

// The covered universe. To add a stock, add one line with the provider's identifier:
// nasdaq = ticker, nordic = orderbook id, euronext = ISIN-MIC, baltic = ISIN.
export const STOCKS: Instrument[] = [
  stock('AAPL', 'Apple', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'AAPL'),
  stock('MSFT', 'Microsoft', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'MSFT'),
  stock('NVDA', 'Nvidia', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'NVDA'),
  stock('AMD', 'Advanced Micro Devices', 'XNAS', 'USD', 'US', 'T', 'nasdaq', 'AMD'),
  stock('GOOGL', 'Alphabet', 'XNAS', 'USD', 'US', 'C', 'nasdaq', 'GOOGL'),
  stock('META', 'Meta Platforms', 'XNAS', 'USD', 'US', 'C', 'nasdaq', 'META'),
  stock('AMZN', 'Amazon', 'XNAS', 'USD', 'US', 'D', 'nasdaq', 'AMZN'),
  stock('TSLA', 'Tesla', 'XNAS', 'USD', 'US', 'D', 'nasdaq', 'TSLA'),
  stock('KO', 'Coca-Cola', 'XNYS', 'USD', 'US', 'S', 'nasdaq', 'KO'),
  stock('JPM', 'JPMorgan Chase', 'XNYS', 'USD', 'US', 'F', 'nasdaq', 'JPM'),
  stock('V', 'Visa', 'XNYS', 'USD', 'US', 'F', 'nasdaq', 'V'),
  stock('XOM', 'Exxon Mobil', 'XNYS', 'USD', 'US', 'E', 'nasdaq', 'XOM'),
  stock('JNJ', 'Johnson & Johnson', 'XNYS', 'USD', 'US', 'H', 'nasdaq', 'JNJ'),

  stock('ASML.AS', 'ASML Holding', 'XAMS', 'EUR', 'EU', 'T', 'euronext', 'NL0010273215-XAMS'),
  stock('SHELL.AS', 'Shell', 'XAMS', 'EUR', 'EU', 'E', 'euronext', 'GB00BP6MXD84-XAMS'),
  stock('INGA.AS', 'ING Groep', 'XAMS', 'EUR', 'EU', 'F', 'euronext', 'NL0011821202-XAMS'),
  stock('HEIA.AS', 'Heineken', 'XAMS', 'EUR', 'EU', 'S', 'euronext', 'NL0000009165-XAMS'),
  stock('MC.PA', 'LVMH', 'XPAR', 'EUR', 'EU', 'D', 'euronext', 'FR0000121014-XPAR'),
  stock('AIR.PA', 'Airbus', 'XPAR', 'EUR', 'EU', 'I', 'euronext', 'NL0000235190-XPAR'),
  stock('OR.PA', "L'Oréal", 'XPAR', 'EUR', 'EU', 'S', 'euronext', 'FR0000120321-XPAR'),
  stock('TTE.PA', 'TotalEnergies', 'XPAR', 'EUR', 'EU', 'E', 'euronext', 'FR0000120271-XPAR'),
  stock('SAN.PA', 'Sanofi', 'XPAR', 'EUR', 'EU', 'H', 'euronext', 'FR0000120578-XPAR'),
  // SAP's home listing is Xetra, which has no keyless public feed. This is its Euronext Milan (EuroTLX) line.
  stock('SAP.MI', 'SAP', 'XMIL', 'EUR', 'EU', 'T', 'euronext', 'DE0007164600-ETLX'),
  stock('NOVO-B.CO', 'Novo Nordisk', 'XCSE', 'DKK', 'EU', 'H', 'nordic', 'TX2178'),
  stock('DSV.CO', 'DSV', 'XCSE', 'DKK', 'EU', 'I', 'nordic', 'TX2319'),
  stock('NOKIA.HE', 'Nokia', 'XHEL', 'EUR', 'EU', 'T', 'nordic', 'TX50063'),

  stock('IGN1L.VS', 'Ignitis grupė', 'XLIT', 'EUR', 'BAL', 'U', 'baltic', 'LT0000115768'),
  stock('TEL1L.VS', 'Telia Lietuva', 'XLIT', 'EUR', 'BAL', 'C', 'baltic', 'LT0000123911'),
  stock('ROE1L.VS', 'Artea Bankas', 'XLIT', 'EUR', 'BAL', 'F', 'baltic', 'LT0000102253'),
  stock('APG1L.VS', 'Apranga', 'XLIT', 'EUR', 'BAL', 'D', 'baltic', 'LT0000102337'),
  stock('AKO1L.VS', 'Akola Group', 'XLIT', 'EUR', 'BAL', 'S', 'baltic', 'LT0000128092'),
  stock('KNE1L.VS', 'KN Energies', 'XLIT', 'EUR', 'BAL', 'E', 'baltic', 'LT0000111650'),
  stock('GRG1L.VS', 'Grigeo Group', 'XLIT', 'EUR', 'BAL', 'M', 'baltic', 'LT0000102030'),
  stock('LHV1T.TL', 'LHV Group', 'XTAL', 'EUR', 'BAL', 'F', 'baltic', 'EE3100102203'),
  stock('TAL1T.TL', 'Tallink Grupp', 'XTAL', 'EUR', 'BAL', 'D', 'baltic', 'EE3100004466'),
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

export function findInstrument(input: string): Instrument | undefined {
  const s = input.trim().toUpperCase();
  return (
    ALL.find((i) => i.symbol === s) ??
    ALL.find((i) => i.symbol === ALIASES[s]) ??
    ALL.find((i) => i.symbol.split('.')[0] === s)
  );
}

// Ticker as printed in tables: without the exchange suffix.
export const shortSymbol = (symbol: string) => symbol.split('.')[0];
