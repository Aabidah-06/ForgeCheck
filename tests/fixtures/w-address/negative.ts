import { StrKey, Operation } from "@stellar/stellar-sdk";
export function isValidCreateAccountDestination(address: string) {
  return StrKey.isValidEd25519PublicKey(address);
}
export function isValidAccountOnlyAddress(address: string) {
  return StrKey.isValidEd25519PublicKey(address);
}
export function isValidStellarAddress(address: string) {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address) || StrKey.isValidMuxedContract(address);
}
export const stellarAddressRegex = /^[GMCW][A-Z2-7]{55}$/;
export function displayStellarAddress(address: string) {
  switch (address[0]) {
    case "G": return "account";
    case "M": return "muxed account";
    case "C": return "contract";
    case "W": return "muxed contract";
  }
}
export function createAccountDestination(address: string) {
  return Operation.createAccount({destination: address, startingBalance: "1"});
}
// /^([GMC])$/ and StrKey.isValidContract are comments, not live checks.
const documentation = "switch(address[0]) {case 'G': ... }";
