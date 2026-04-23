import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../utils/sanitize.js";

describe("sanitizeHtml", () => {
  it("escapes ampersands", () => {
    expect(sanitizeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than signs", () => {
    expect(sanitizeHtml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than signs", () => {
    expect(sanitizeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(sanitizeHtml('she said "hello"')).toBe("she said &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(sanitizeHtml("it's fine")).toBe("it&#x27;s fine");
  });

  it("escapes all special characters in one string", () => {
    expect(sanitizeHtml(`<script>alert("x&y's")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&#x27;s&quot;)&lt;/script&gt;"
    );
  });

  it("returns an empty string unchanged", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("returns strings with no special characters unchanged", () => {
    expect(sanitizeHtml("hello world 123")).toBe("hello world 123");
  });

  it("handles strings that are purely special characters", () => {
    expect(sanitizeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#x27;");
  });
});
