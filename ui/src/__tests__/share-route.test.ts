import { getShareIdFromPathname, getShareUrl } from "../share-route";

describe("getShareIdFromPathname", () => {
  it("reads a share ID at the site root or below a GitHub Pages project path", () => {
    expect(getShareIdFromPathname("/share/abc-123")).toBe("abc-123");
    expect(getShareIdFromPathname("/huebloom/share/abc-123/")).toBe("abc-123");
  });

  it("only accepts a final share path pair and rejects malformed encoding", () => {
    expect(getShareIdFromPathname("/share")).toBeNull();
    expect(getShareIdFromPathname("/share/abc-123/extra")).toBeNull();
    expect(getShareIdFromPathname("/share/%E0%A4%A")).toBeNull();
  });

  it("builds a route below the deployed site root", () => {
    expect(getShareUrl("abc-123", "https://owner.github.io/huebloom/")).toBe(
      "https://owner.github.io/huebloom/share/abc-123/",
    );
  });
});
