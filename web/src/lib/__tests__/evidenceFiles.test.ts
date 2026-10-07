import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGES, parseImages, parseLinks, safeName, sniffImage } from "../evidenceFiles";
import { fetchEvidenceLink, isPrivateAddress } from "../linkFetch";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("images are identified by content, not by what the client says", () => {
  assert.equal(sniffImage(Buffer.from(PNG_1PX, "base64")), "image/png");
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(Buffer.from("#!/bin/sh\necho hi")), null);
});

test("parseImages accepts good PNGs and rejects disguised files", () => {
  const ok = parseImages([{ name: "shot.png", data: PNG_1PX }]);
  assert.equal(ok.ok && ok.files[0].mime, "image/png");
  const fake = parseImages([{ name: "evil.png", data: Buffer.from("<script>alert(1)</script>").toString("base64") }]);
  assert.equal(fake.ok, false);
  assert.equal(parseImages([{ name: "x", data: "not base64!!" }]).ok, false);
});

test("image count and size limits hold", () => {
  const many = Array.from({ length: MAX_IMAGES + 1 }, () => ({ name: "a.png", data: PNG_1PX }));
  assert.equal(parseImages(many).ok, false);
  const big = Buffer.concat([Buffer.from(PNG_1PX, "base64"), Buffer.alloc(1_600_000)]).toString("base64");
  assert.equal(parseImages([{ name: "big.png", data: big }]).ok, false);
});

test("file names are scrubbed", () => {
  assert.equal(safeName("../../etc/pass wd<>.png"), "etcpass wd.png");
  assert.equal(safeName(""), "image");
});

test("only plain https links are accepted", () => {
  assert.equal(parseLinks(["https://example.com/proof"]).ok, true);
  for (const bad of ["http://example.com", "javascript:alert(1)", "https://user:pw@example.com", "ftp://x.y", "not a url"]) {
    assert.equal(parseLinks([bad]).ok, false, bad);
  }
  assert.equal(parseLinks(Array(6).fill("https://example.com")).ok, false);
});

test("private, loopback, link-local and metadata addresses are all refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("the fetcher refuses internal targets without touching the network", async () => {
  for (const url of ["https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/", "https://db.internal/", "https://10.0.0.5/", "http://example.com/"]) {
    const r = await fetchEvidenceLink(url);
    assert.equal(r.status, "blocked", `${url} -> ${r.status} ${r.note}`);
  }
});
