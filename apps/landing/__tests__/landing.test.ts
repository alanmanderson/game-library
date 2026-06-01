import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";

const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");

function loadPage(): Document {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://games.alanmanderson.com" });
  return dom.window.document;
}

describe("landing page", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadPage();
  });

  it("has the correct page title", () => {
    expect(doc.title).toBe("Game Library");
  });

  it("renders the header", () => {
    const h1 = doc.querySelector(".header h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe("Game Library");
  });

  it("renders exactly 8 game cards", () => {
    const cards = doc.querySelectorAll(".card");
    expect(cards.length).toBe(8);
  });

  describe("game tiles", () => {
    const expectedGames = [
      { name: "Backgammon", url: "https://backgammon.games.alanmanderson.com", players: "2 players", duration: "15 min", hasBot: true },
      { name: "AI Pinochle", url: "https://pinochle.games.alanmanderson.com", players: "4 players", duration: "45 min", hasBot: false },
      { name: "Forbidden Island", url: "https://fi.games.alanmanderson.com", players: "2 \u2013 4 players", duration: "30 min", hasBot: false },
      { name: "Bughouse", url: "https://bughouse.games.alanmanderson.com", players: "4 players (2v2)", duration: "10 min", hasBot: false },
      { name: "Telestrations", url: "https://telestrations.games.alanmanderson.com", players: "2 \u2013 8 players", duration: "20 min", hasBot: false },
      { name: "Lemonade Stand", url: "https://lemonade.games.alanmanderson.com", players: "1 player", duration: "30 min", hasBot: false },
      { name: "Sneaky Sabotage", url: "https://sabotage.games.alanmanderson.com", players: "3 \u2013 8 players", duration: "30 min", hasBot: false },
      { name: "Spades", url: "#", players: "4 players", duration: "30 min", hasBot: false },
    ];

    expectedGames.forEach((game) => {
      it(`renders "${game.name}" with correct link`, () => {
        const card = findCardByName(doc, game.name);
        expect(card).not.toBeNull();
        expect(card!.getAttribute("href")).toBe(game.url);
      });

      it(`renders "${game.name}" with player count and duration`, () => {
        const card = findCardByName(doc, game.name)!;
        const tags = card.querySelectorAll(".tag");
        const tagTexts = Array.from(tags).map((t) => t.textContent!.trim());
        expect(tagTexts.some((t) => t.includes(game.players))).toBe(true);
        expect(tagTexts.some((t) => t.includes(game.duration))).toBe(true);
      });

      if (game.hasBot) {
        it(`renders "${game.name}" with AI opponent tag`, () => {
          const card = findCardByName(doc, game.name)!;
          const botTag = card.querySelector(".tag--bot");
          expect(botTag).not.toBeNull();
          expect(botTag!.textContent).toContain("AI opponent");
        });
      }
    });
  });

  describe("Spades coming soon", () => {
    it("has the coming-soon class", () => {
      const card = findCardByName(doc, "Spades");
      expect(card!.classList.contains("card--coming-soon")).toBe(true);
    });

    it("shows a Coming Soon badge", () => {
      const card = findCardByName(doc, "Spades")!;
      const badge = card.querySelector(".coming-soon-badge");
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("Coming Soon");
    });
  });

  it("no other game has the coming-soon class", () => {
    const comingSoon = doc.querySelectorAll(".card--coming-soon");
    expect(comingSoon.length).toBe(1);
  });

  it("every active game links to a *.games.alanmanderson.com URL", () => {
    const cards = doc.querySelectorAll(".card:not(.card--coming-soon)");
    cards.forEach((card) => {
      const href = card.getAttribute("href")!;
      expect(href).toMatch(/^https:\/\/\w+\.games\.alanmanderson\.com$/);
    });
  });

  it("every card has an icon area with a gradient background", () => {
    const icons = doc.querySelectorAll(".card-icon");
    expect(icons.length).toBe(8);
    icons.forEach((icon) => {
      const style = (icon as HTMLElement).getAttribute("style");
      expect(style).toContain("linear-gradient");
    });
  });

  it("every card has a genre, title, and description", () => {
    const cards = doc.querySelectorAll(".card");
    cards.forEach((card) => {
      expect(card.querySelector(".card-genre")!.textContent!.length).toBeGreaterThan(0);
      expect(card.querySelector(".card-title")!.textContent!.length).toBeGreaterThan(0);
      expect(card.querySelector(".card-desc")!.textContent!.length).toBeGreaterThan(0);
    });
  });

  it("renders the footer", () => {
    const footer = doc.querySelector(".footer");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("Alan Anderson");
  });
});

function findCardByName(doc: Document, name: string): Element | null {
  const titles = doc.querySelectorAll(".card-title");
  for (const title of titles) {
    if (title.textContent === name) {
      return title.closest(".card");
    }
  }
  return null;
}
