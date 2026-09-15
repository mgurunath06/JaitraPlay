import { expect, it } from "vitest";
import type { Landmark } from "../camera/observe";
import { BUILD_WORDS, airWritingScore, focusTokens, letterChoices, matchesBodyLetter, wristPoint } from "./literacy";

it("prioritises clean, unique weekly literacy focus tokens", () => {
  expect(focusTokens("B, b, at; in! 123 longword")).toEqual(["b", "at", "in"]);
});

it("separates target letters among distractors in letter-card rounds", () => {
  for (const [round, word] of BUILD_WORDS.entries()) {
    const choices = letterChoices(word, round);
    expect(choices).toHaveLength(6);
    expect(new Set(choices)).toHaveLength(6);
    expect(choices.join("")).not.toContain(word);
    expect([...new Set(word)].every(letter => choices.includes(letter))).toBe(true);
  }
});

it("scores a recognisable air-written C and rejects too few points", () => {
  const c = [{x:.85,y:.18},{x:.65,y:.08},{x:.35,y:.12},{x:.14,y:.35},{x:.12,y:.68},{x:.35,y:.9},{x:.72,y:.86},{x:.88,y:.72}];
  expect(airWritingScore("c", c)).toBeGreaterThan(.9);
  expect(airWritingScore("c", c.slice(0, 3))).toBe(0);
});

it("uses one visible wrist and recognises a body T", () => {
  const pose = Array.from({length:33},()=>({x:.5,y:.5,visibility:1})) as Landmark[];
  pose[11]={x:.4,y:.35,visibility:1}; pose[12]={x:.6,y:.35,visibility:1};
  pose[15]={x:.1,y:.35,visibility:1}; pose[16]={x:.9,y:.35,visibility:1};
  pose[27]={x:.46,y:.9,visibility:1}; pose[28]={x:.54,y:.9,visibility:1};
  expect(matchesBodyLetter("T", [pose])).toBe(true);
  expect(wristPoint([pose])?.x).toBeCloseTo(.1);
  expect(wristPoint([pose])?.y).toBeCloseTo(.35);
});

it("distinguishes the remaining body shapes and rejects uncertain poses", () => {
  const pose = Array.from({length:33},()=>({x:.5,y:.5,visibility:1})) as Landmark[];
  pose[11]={x:.4,y:.35,visibility:1}; pose[12]={x:.6,y:.35,visibility:1};
  const set = (leftX:number, leftY:number, rightX:number, rightY:number, feetWide=false) => {
    pose[15]={x:leftX,y:leftY,visibility:1}; pose[16]={x:rightX,y:rightY,visibility:1};
    pose[27]={x:feetWide?.25:.46,y:.9,visibility:1}; pose[28]={x:feetWide?.75:.54,y:.9,visibility:1};
  };
  set(.1,.1,.9,.1); expect(matchesBodyLetter("Y",[pose])).toBe(true); expect(matchesBodyLetter("X",[pose])).toBe(false);
  set(.1,.1,.9,.1,true); expect(matchesBodyLetter("X",[pose])).toBe(true); expect(matchesBodyLetter("Y",[pose])).toBe(false);
  set(.4,.65,.6,.65); expect(matchesBodyLetter("I",[pose])).toBe(true);
  set(.4,.65,.6,.65,true); expect(matchesBodyLetter("V",[pose])).toBe(true);
  set(.1,.35,.6,.65); expect(matchesBodyLetter("L",[pose])).toBe(true);
  set(.48,.1,.52,.1); expect(matchesBodyLetter("O",[pose])).toBe(true);
  expect(matchesBodyLetter("O",[pose,pose])).toBe(false);
  pose[15].visibility=0; expect(matchesBodyLetter("O",[pose])).toBe(false);
  expect(wristPoint([pose,pose])).toBeNull();
});
