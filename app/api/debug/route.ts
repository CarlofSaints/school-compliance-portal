import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  try {
    const result = await list({ prefix: "hvps/" });
    const blobs = result.blobs.map((b) => ({
      pathname: b.pathname,
      url: b.url,
      downloadUrl: b.downloadUrl,
      size: b.size,
    }));

    // Try to read users.json specifically
    let usersContent = null;
    const usersBlob = result.blobs.find((b) => b.pathname === "hvps/users.json");
    if (usersBlob) {
      try {
        const res = await fetch(usersBlob.downloadUrl);
        usersContent = {
          status: res.status,
          ok: res.ok,
          text: await res.text(),
        };
      } catch (err) {
        usersContent = { error: String(err) };
      }
    }

    return NextResponse.json({ blobCount: blobs.length, blobs, usersContent });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
