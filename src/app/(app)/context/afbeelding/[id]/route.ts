import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Afbeelding uit de context- en stakeholderanalyse (alleen voor ingelogde gebruikers). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Niet gevonden", { status: 404 });
  const img = await prisma.contextImage.findUnique({ where: { id }, select: { contentType: true, data: true } });
  if (!img || !ALLOWED.includes(img.contentType)) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "private, max-age=31536000, immutable", // id is uniek per versie
      "X-Content-Type-Options": "nosniff",
    },
  });
}
