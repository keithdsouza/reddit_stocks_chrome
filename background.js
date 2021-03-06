/*
 * Constants
 */

// These "tickers" are usually not really tickers so they should
// be removed. Even if some of them are, if they are generally
// used in a non-ticker sense, its a better UX to just filter them
const tickersToFilter = [
  "PUT",
  "CALL",
  "ITM",
  "OTM",
  "EST",
  "IPO",
  "CEO",
  "COO",
  "DTE",
  "BUY",
  "LEAP",
  "PUMP",
  "API",
];

/**
 * Listener
 */

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.contentScriptQuery === "fetchStock") {
    getSpecificStock(request).then((res) => sendResponse(res));
  }
  return true;
});

/*
 * Helper functions
 */

async function getSpecificStock(params) {
  try {
    const { tickers } = params;
    // Remove duplicates from tickers and account for tickers being null
    const nonNullTickers = tickers || [];
    const upperTickers = nonNullTickers.map((ticker) => ticker.toUpperCase());
    const noDupTickersSet = new Set(upperTickers);

    tickersToFilter.forEach((toRemove) => noDupTickersSet.delete(toRemove));

    const finalTickers = Array.from(noDupTickersSet);

    return {
      results: (
        await Promise.all(
          finalTickers.map(async (ticker) => {
            try {
              const optionsRes = await fetch(
                `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`
              );

              const optionsResJson = await optionsRes.json();
              const result = optionsResJson.optionChain.result[0];

              const { quote } = result;
              const { bid, ask, regularMarketPreviousClose } = quote;
              if (
                bid == null ||
                ask == null ||
                regularMarketPreviousClose == null
              ) {
                // Fail gracefully if we are missing a key metric
                return null;
              }

              // https://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-only-if-necessary
              const marketPrice = Math.round(((bid + ask) / 2) * 100) / 100;

              return {
                ticker,
                marketPrice,
                previousClose: regularMarketPreviousClose,
              };
            } catch (error) {
              // Gracefully return null if error occurred
              // so we can still return some of the stocks
              return null;
            }
          })
        )
      )
        // Remove all null results
        .filter((res) => res != null),
    };
  } catch (error) {
    return { error };
  }
}

// This is currently unused but this could be useful in the future
async function getSpecificOption(params) {
  try {
    const { targetStrike, targetExpDate, ticker, targetOptionType } = params;

    const optionsRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?date=${targetExpDate}`
    );
    const optionsResJson = await optionsRes.json();
    const result = optionsResJson.optionChain.result[0];

    const { quote, options } = result;
    const bid = quote.bid;
    const ask = quote.ask;
    const marketPrice = (bid + ask) / 2;

    const optionsForExpDate = options.find(
      ({ expirationDate }) => expirationDate === targetExpDate
    );
    const optionsForType = optionsForExpDate[targetOptionType];
    const specificOption = optionsForType.find(
      ({ strike }) => targetStrike === strike
    );
    const specificOptionPrice = specificOption.lastPrice;

    return {
      marketPrice,
      specificOptionPrice,
    };
  } catch (error) {
    return { error };
  }
}
