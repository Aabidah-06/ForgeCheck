import { StrKey } from "@stellar/stellar-sdk";
export function isValidStellarAddress(address: string) {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidMed25519PublicKey(address) || StrKey.isValidContract(address);
}
export const stellarAddressRegex = /^[GMC][A-Z2-7]{55}$/;
export function displayStellarAddress(address: string) {
  switch (address[0]) {
    case "G": return "account";
    case "M": return "muxed account";
    case "C": return "contract";
    default: return "unknown";
  }
}
