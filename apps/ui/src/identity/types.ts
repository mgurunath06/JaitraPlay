export interface IdentityProfile {
  version: 1;
  model: "face-api-1.7.15-recognition";
  name: "Jaitra";
  descriptors: number[][];
}

export interface PersonProfile extends Omit<IdentityProfile, "name"> {
  id: string;
  name: string;
  relationship: "father" | "mother" | "sibling" | "grandparent" | "relative" | "friend" | "caregiver" | "other";
}
