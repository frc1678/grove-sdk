import { describe, expect, test } from "vitest";
import { groveTutorials, tutorialCatalogJson, validateTutorialCatalog } from "./tutorialCatalog.js";

const good = { id: "rsvp", title: " RSVP to a meeting ", summary: "Say whether you're coming.", points: 10 };

describe("validateTutorialCatalog", () => {
  test("trims text and fills in minRole", () => {
    expect(validateTutorialCatalog([good]).tutorials).toEqual([
      { id: "rsvp", title: "RSVP to a meeting", summary: "Say whether you're coming.", points: 10, minRole: "student" },
    ]);
  });

  test("names every problem with its tutorial", () => {
    const { errors } = validateTutorialCatalog([
      good,
      { ...good, points: 500, minutes: 0, minrole: "coach" },
      { id: "Bad Id", title: "", summary: "x", points: 5.5, minRole: "owner" },
    ]);
    expect(errors).toEqual([
      'tutorial 2 (rsvp): unknown field "minrole"',
      "tutorial 2 (rsvp): id is already used by an earlier tutorial",
      "tutorial 2 (rsvp): points must be a whole number from 5 to 50",
      "tutorial 2 (rsvp): minutes must be a whole number from 1 to 30",
      "tutorial 3 (Bad Id): id must be lowercase letters, digits and dashes, starting with a letter",
      "tutorial 3 (Bad Id): title must be 1–60 characters once trimmed",
      "tutorial 3 (Bad Id): points must be a whole number from 5 to 50",
      "tutorial 3 (Bad Id): minRole must be one of student, lead, coach, admin",
    ]);
  });

  test("the plugin refuses a bad catalog when the config loads", () => {
    expect(() => groveTutorials([{ ...good, points: 0 }])).toThrow(/grove-tutorials.json has 1 problem/);
    expect(JSON.parse(tutorialCatalogJson([good]))).toMatchObject({ version: 1 });
  });
});
