import { stripPhoneSuffix } from "./phone";
import { GmMention } from "./types";

// Bare org_phone numbers (no @c.us suffix, country code included, e.g. "9198xxxxxxx") —
// the GM WhatsApp numbers connected to Periskope — mapped to the GM to @mention
// when an opportunity is detected on that number's 1:1 chats.
const PHONE_TO_GM: Record<string, { name: string; aadId: string }> = {
  "918050769512": { name: "Vishrutha Gowda", aadId: "4325b7b4-5502-4bb4-a673-df714bbaa34c" },
  "919686512267": { name: "Afraa Khan", aadId: "95e646b4-f63c-43b2-b38c-8da4515ae946" },
  "916364360114": { name: "Jeffrey Benjamin", aadId: "58939c99-ac2a-41a7-b49e-b4402c1b8a99" },
  "917829247923": { name: "Bipasha Mandal", aadId: "5f13b989-0010-4d94-9f76-701ff658d2f1" },
  "918050025676": { name: "Mehak Sultana", aadId: "15fe1b7a-9a0b-4a4a-9652-67164cff4605" },
  "919900105212": { name: "Venkatesh Upadhyay", aadId: "f43d4d79-8e43-47d3-876c-b678272c38fb" },
  "918123107947": { name: "Eshita Chauhan", aadId: "89f4d1e8-3eb1-4952-8495-58aad558fa87" },
  "917204385841": { name: "Zuber Ahmed", aadId: "450acb91-bdfd-4c40-9a4b-41eea9ac9009" },
  "919661427387": { name: "Aviral Singh", aadId: "e96f1d3e-463d-46ef-b1ad-c180ede7bb90" },
  "918904987623": { name: "Harsh K Khatri", aadId: "99628c40-1c4d-410f-9642-4be642e5c7da" },
  "917338522425": { name: "Rishabh Chouhan", aadId: "eae99cba-dca4-4c5c-b236-132084bbec33" },
  "919740013107": { name: "Radhika Menon", aadId: "c615a5f0-e35e-4de5-a3b7-92e66d8e10cf" },
  "918904255416": { name: "Anand Mohan", aadId: "3990dd7e-9aaa-42e3-b85f-784305f878be" },
  "917022105657": { name: "Indraja Guntireddy", aadId: "ce8b3724-fc07-444f-aa21-a248e92a6691" },
  "917411724400": { name: "Dhananjai Dogra", aadId: "c559e378-51b9-4044-8b09-cfa3f70514fd" },
  "919560255213": { name: "Bhavya Sikka", aadId: "2991e98b-230b-4341-bbc6-c0f8f52cd3b3" },
};

// Internal team members — GMs also chat with these numbers, and those
// conversations must never be forwarded to Teams.
const INTERNAL_NUMBERS = new Set([
  "917411725500",
  "918904255416",
  "919740013107",
  "917411724400",
  "916366575567",
]);

export function isInternalNumber(phone: string): boolean {
  return INTERNAL_NUMBERS.has(stripPhoneSuffix(phone));
}

export function gmForPhone(phone: string): GmMention | null {
  const entry = PHONE_TO_GM[stripPhoneSuffix(phone)];
  return entry ? { name: entry.name, aadId: entry.aadId } : null;
}

export function isTrackedNumber(phone: string): boolean {
  return stripPhoneSuffix(phone) in PHONE_TO_GM;
}
