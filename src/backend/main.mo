import Map "mo:core/Map";
import OutCall "http-outcalls/outcall";

actor {
  type CryptoSignal = {
    coinId : Text;
    symbol : Text;
    name : Text;
    currentPrice : Float;
    dayVolume : Float;
    monthAvgVolume : Float;
    dayHigh : Float;
    signalType : Text;
    priceChangePercentage24h : Float;
  };

  // Retained to satisfy upgrade compatibility with previous stable variable
  let signalCache = Map.empty<Text, CryptoSignal>();

  public query ({ caller }) func transform(input: OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  // Stub - scanning is handled client-side via direct CoinGecko fetch
  public shared ({ caller }) func scanMarkets() : async [CryptoSignal] {
    [];
  };

  // Stub - no longer used
  public query ({ caller }) func getAllSignals() : async [CryptoSignal] {
    [];
  };
};
