import type { CSSProperties, ReactNode } from "react";
import {
  REVIEW_THEME as T,
  SLIDE_W,
  formatChartValue,
  safeSlideData,
  type ChapterData,
  type ConclusionData,
  type ContentData,
  type FmtMap,
  type SlideElement,
  type TextFmt,
  type TitleData,
} from "@/lib/review-model";
import { fmtCss } from "@/lib/review-fmt";

/**
 * Voorbeeld van een dia in HTML, op schaal (container-eenheden): 1 inch = 100/13,333 cqw, 1 pt = 1/72 inch.
 * Werkt op de server en in de browser (editor).
 */

const IN = 100 / SLIDE_W; // cqw per inch
const pt = (n: number) => `${(n / 72) * IN}cqw`;
const inch = (n: number) => `${n * IN}cqw`;
const c = (hex?: string) => (hex ? `#${hex}` : undefined);
export const reviewImageSrc = (id: string) => `/directiebeoordeling/afbeelding/${id}`;
/** Opmaak van een veld (lettertype, grootte, kleur, stijl, uitlijning) als CSS. */
const F = (f?: TextFmt) => fmtCss(f, pt);
const fm = (m: FmtMap | undefined, k: string) => F(m?.[k]);

const FONT = `"${T.font}", "Fira Sans", system-ui, sans-serif`;
const LIGHT = `"${T.fontLight}", "Fira Sans", system-ui, sans-serif`;

function Box({
  x,
  y,
  w,
  h,
  style,
  children,
  title,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  style?: CSSProperties;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <div title={title} style={{ position: "absolute", left: inch(x), top: inch(y), width: inch(w), height: inch(h), overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function Img({ id, x, y, w, h, fit = "cover" }: { id?: string | null; x: number; y: number; w: number; h: number; fit?: "cover" | "contain" }) {
  if (!id) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={reviewImageSrc(id)} alt="" style={{ position: "absolute", left: inch(x), top: inch(y), width: inch(w), height: inch(h), objectFit: fit }} />
  );
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function ChartPreview({ e }: { e: Extract<SlideElement, { type: "chart" }> }) {
  const s = e.series[0] ?? { name: "", values: [] };
  const max = Math.max(1, ...e.series.flatMap((x) => x.values));
  const titleH = e.title ? 0.35 : 0;
  if (e.kind === "bar") {
    const n = Math.max(e.categories.length, 1);
    const rowH = (e.h - titleH - 0.2) / n;
    const order = e.categories.map((_, i) => i).reverse();
    return (
      <Box x={e.x} y={e.y} w={e.w} h={e.h}>
        {e.title && (
          <div style={{ fontFamily: FONT, fontSize: pt(11), color: c(T.ink), textAlign: "center", height: inch(titleH), ...fm(e.fmt, "title") }}>{e.title}</div>
        )}
        {order.map((i, row) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: inch(titleH + 0.1 + row * rowH),
              left: 0,
              width: "100%",
              height: inch(rowH),
              display: "flex",
              alignItems: "center",
              gap: inch(0.08),
            }}
          >
            <span
              style={{
                width: "38%",
                textAlign: "right",
                fontFamily: LIGHT,
                fontSize: pt(9),
                color: c(T.muted),
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {e.categories[i]}
            </span>
            <span style={{ height: "45%", width: `${(s.values[i] / max) * 52}%`, minWidth: 1, background: c(e.colors[i] ?? T.redDark) }} />
            <span style={{ fontFamily: LIGHT, fontSize: pt(8), color: c(T.ink) }}>{formatChartValue(s.values[i] ?? 0, e.decimals)}</span>
          </div>
        ))}
      </Box>
    );
  }
  const n = Math.max(e.categories.length, 1);
  const colW = (e.w - 0.2) / n;
  const plotH = e.h - titleH - 0.55;
  return (
    <Box x={e.x} y={e.y} w={e.w} h={e.h}>
      {e.title && (
        <div style={{ fontFamily: FONT, fontSize: pt(11), color: c(T.ink), textAlign: "center", height: inch(titleH), ...fm(e.fmt, "title") }}>{e.title}</div>
      )}
      {e.categories.map((cat, i) => {
        const multi = e.series.length > 1;
        return (
          <div key={i} style={{ position: "absolute", left: inch(0.1 + i * colW), width: inch(colW), top: inch(titleH), height: inch(plotH + 0.5) }}>
            <div
              style={{
                position: "absolute",
                bottom: inch(0.3),
                left: "18%",
                right: "18%",
                height: inch(plotH),
                display: "flex",
                alignItems: "flex-end",
                gap: 1,
              }}
            >
              {e.series.map((ser, si) => (
                <div key={si} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ fontFamily: LIGHT, fontSize: pt(8), color: c(T.ink) }}>{formatChartValue(ser.values[i] ?? 0, e.decimals)}</span>
                  <span
                    style={{ width: "100%", height: `${((ser.values[i] ?? 0) / max) * 85}%`, background: c(multi ? e.colors[si] : e.colors[i]) ?? "#c9c9c9" }}
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: "100%",
                textAlign: "center",
                fontFamily: LIGHT,
                fontSize: pt(9),
                color: c(T.muted),
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {cat}
            </div>
          </div>
        );
      })}
    </Box>
  );
}

export function ElementPreview({ e, selected }: { e: SlideElement; selected?: boolean }) {
  const outline: CSSProperties = selected ? { outline: "0.3cqw solid #257de0", outlineOffset: "0.2cqw", zIndex: 5 } : {};
  switch (e.type) {
    case "kpi":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={{ background: c(T.card), ...outline }}>
          {e.caption ? (
            <>
              <div
                style={{
                  position: "absolute",
                  left: inch(0.22),
                  top: inch(0.2),
                  right: inch(0.22),
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: pt(9),
                  color: c(T.muted),
                  ...fm(e.fmt, "caption"),
                }}
              >
                {e.caption}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: inch(0.22),
                  top: inch(0.6),
                  right: inch(0.22),
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: pt(30),
                  color: c(e.color ?? T.ink),
                  lineHeight: 1.1,
                  ...fm(e.fmt, "value"),
                }}
              >
                {e.value}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: inch(0.22),
                  top: inch(1.4),
                  right: inch(0.22),
                  fontFamily: LIGHT,
                  fontSize: pt(11),
                  color: c(T.ink),
                  ...fm(e.fmt, "label"),
                }}
              >
                {e.label}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  position: "absolute",
                  left: inch(0.22),
                  top: inch(0.18),
                  right: inch(0.22),
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: pt(28),
                  color: c(e.color ?? T.ink),
                  lineHeight: 1.1,
                  ...fm(e.fmt, "value"),
                }}
              >
                {e.value}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: inch(0.22),
                  top: inch(0.84),
                  right: inch(0.22),
                  fontFamily: LIGHT,
                  fontSize: pt(10.5),
                  color: c(T.muted),
                  lineHeight: 1.2,
                  ...fm(e.fmt, "label"),
                }}
              >
                {e.label}
              </div>
            </>
          )}
        </Box>
      );
    case "card":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={{ background: c(T.card), ...outline }}>
          <div
            style={{
              position: "absolute",
              left: inch(0.25),
              top: inch(0.25),
              width: inch(0.46),
              height: inch(0.46),
              borderRadius: "50%",
              background: c(e.iconColor ?? T.red),
            }}
          />
          {e.iconId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reviewImageSrc(e.iconId)}
              alt=""
              style={{ position: "absolute", left: inch(0.365), top: inch(0.365), width: inch(0.23), height: inch(0.23) }}
            />
          )}
          <div
            style={{
              position: "absolute",
              left: inch(0.85),
              top: inch(0.22),
              right: inch(0.2),
              height: inch(0.52),
              display: "flex",
              alignItems: "center",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: pt(13),
              color: c(T.ink),
              ...fm(e.fmt, "title"),
            }}
          >
            {e.title}
          </div>
          <div
            style={{
              position: "absolute",
              left: inch(0.25),
              top: inch(0.88),
              right: inch(0.25),
              bottom: inch(0.15),
              fontFamily: LIGHT,
              fontSize: pt(e.bodySize ?? 12),
              color: c(T.muted),
              lineHeight: 1.25,
              ...fm(e.fmt, "body"),
            }}
          >
            {lines(e.body).map((l, i) => (
              <div key={i} style={{ marginBottom: pt(4), paddingLeft: e.bullets ? pt(11) : 0, textIndent: e.bullets ? `-${pt(11)}` : 0 }}>
                {e.bullets && "• "}
                {l}
              </div>
            ))}
          </div>
        </Box>
      );
    case "judgment":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={{ background: c(T.judgment), ...outline }}>
          {e.stacked ? (
            <div style={{ position: "absolute", left: inch(0.2), top: inch(0.1), right: inch(0.15), fontSize: pt(10.5), lineHeight: 1.25 }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, color: c(T.redDark), marginBottom: pt(4), ...fm(e.fmt, "label") }}>{e.label}</div>
              <div style={{ fontFamily: LIGHT, color: c(T.ink), ...fm(e.fmt, "text") }}>{e.text}</div>
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                left: inch(0.25),
                right: inch(0.25),
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                fontSize: pt(12.5),
                lineHeight: 1.25,
              }}
            >
              <span>
                <b style={{ fontFamily: FONT, color: c(T.redDark), ...fm(e.fmt, "label") }}>{e.label}</b>
                <span style={{ fontFamily: LIGHT, color: c(T.ink), ...fm(e.fmt, "text") }}>
                  {"   "}
                  {e.text}
                </span>
              </span>
            </div>
          )}
        </Box>
      );
    case "decisions":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={{ background: c(T.redDark), color: "#fff", ...outline }}>
          <div style={{ position: "absolute", left: inch(0.3), top: inch(0.3), right: inch(0.29) }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(11), letterSpacing: pt(2), marginBottom: pt(12), ...fm(e.fmt, "heading") }}>
              {e.heading}
            </div>
            {e.items.map((t, i) => (
              <div
                key={i}
                style={{
                  fontFamily: LIGHT,
                  fontSize: pt(13),
                  marginBottom: pt(8),
                  paddingLeft: pt(13),
                  textIndent: `-${pt(13)}`,
                  lineHeight: 1.2,
                  ...fm(e.fmt, "items"),
                }}
              >
                • {t}
              </div>
            ))}
          </div>
        </Box>
      );
    case "check":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={{ background: c(T.card), ...outline }}>
          <div
            style={{
              position: "absolute",
              left: inch(0.22),
              top: inch((e.h - 0.28) / 2),
              width: inch(0.28),
              height: inch(0.28),
              border: `${pt(1.5)} solid #${T.red}`,
              background: "#fff",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: inch(0.7),
              right: inch(0.2),
              top: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              fontFamily: LIGHT,
              fontSize: pt(12),
              color: c(T.ink),
              lineHeight: 1.2,
              ...fm(e.fmt, "text"),
            }}
          >
            {e.text}
          </div>
        </Box>
      );
    case "text":
      return (
        <Box x={e.x} y={e.y} w={e.w} h={e.h} style={outline}>
          {e.paras.map((p, i) => (
            <div
              key={i}
              style={{
                fontFamily: p.bold ? FONT : LIGHT,
                fontWeight: p.bold ? 700 : 400,
                fontSize: pt(p.size ?? 11),
                color: c(p.color ?? T.muted),
                marginBottom: pt(4),
                lineHeight: 1.2,
                paddingLeft: p.bullet ? pt(11) : 0,
                textIndent: p.bullet ? `-${pt(11)}` : 0,
                ...F({ font: p.font, italic: p.italic, underline: p.underline, align: p.align }),
                ...(p.bold ? { fontWeight: 700 } : {}),
              }}
            >
              {p.bullet && "• "}
              {p.text}
            </div>
          ))}
        </Box>
      );
    case "table": {
      const total = e.colW.reduce((n, v) => n + v, 0);
      const fs = e.fontSize ?? 10.5;
      return (
        <div style={{ position: "absolute", left: inch(e.x), top: inch(e.y), width: inch(total), ...outline }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {e.colW.map((w, i) => (
                <col key={i} style={{ width: `${(w / total) * 100}%` }} />
              ))}
            </colgroup>
            {e.header.length > 0 && (
              <thead>
                <tr style={{ height: inch(e.rowH) }}>
                  {e.header.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: "left",
                        verticalAlign: "bottom",
                        padding: `${pt(4)} ${pt(6)} ${pt(4)} 0`,
                        fontFamily: FONT,
                        fontWeight: 700,
                        fontSize: pt(8.5),
                        letterSpacing: pt(1),
                        color: c(T.muted),
                        borderBottom: `${pt(1)} solid #${T.ink}`,
                        ...fm(e.fmt, "header"),
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {e.rows.map((r, ri) => (
                <tr key={ri} style={{ height: inch(e.rowH) }}>
                  {e.colW.map((_, ci) => {
                    const cell = r[ci] ?? { text: "" };
                    return (
                      <td
                        key={ci}
                        style={{
                          padding: `${pt(4)} ${pt(6)} ${pt(4)} 0`,
                          fontFamily: cell.bold ? FONT : LIGHT,
                          fontWeight: cell.bold ? 700 : 400,
                          fontSize: pt(fs),
                          color: c(cell.color ?? T.ink),
                          borderBottom: `${pt(0.75)} solid #${T.rule}`,
                          lineHeight: 1.2,
                          whiteSpace: "pre-line",
                          ...fm(e.fmt, "body"),
                          // Status/vet per cel gaat voor op de opmaak van de hele tabel.
                          ...(cell.color ? { color: c(cell.color) } : {}),
                          ...(cell.bold ? { fontWeight: 700 } : {}),
                        }}
                      >
                        {cell.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "chart":
      return (
        <div style={outline}>
          <ChartPreview e={e} />
        </div>
      );
  }
}

export type PreviewSlide = { layout: string; kicker: string | null; title: string; imageId: string | null; data: unknown };
export type PreviewReview = { logoImageId: string | null; stripImageId: string | null; footerText: string | null };

/** Eén dia op schaal. `number` = paginanummer op inhoudsdia's. */
export function SlidePreview({
  slide,
  review,
  number,
  selectedId,
}: {
  slide: PreviewSlide;
  review: PreviewReview;
  number?: number;
  selectedId?: string | null;
}) {
  const frame: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    containerType: "inline-size",
    overflow: "hidden",
    background: "#fff",
  };
  const white = "#fff";

  if (slide.layout === "TITLE") {
    const d = safeSlideData("TITLE", slide.data) as TitleData;
    return (
      <div style={{ ...frame, background: c(T.chapterBg) }}>
        <Img id={slide.imageId} x={0} y={0} w={SLIDE_W} h={7.5} />
        <Box x={0} y={0} w={7.6} h={7.5} style={{ background: "rgba(0,0,0,.7)" }} />
        <Box
          x={0.7}
          y={1.55}
          w={6}
          h={0.35}
          style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(12), color: c(T.red), letterSpacing: pt(3), ...fm(d.fmt, "brand") }}
        >
          {d.brand}
        </Box>
        <Box
          x={0.7}
          y={1.95}
          w={6.7}
          h={1.6}
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: pt(44),
            color: white,
            display: "flex",
            alignItems: "center",
            lineHeight: 1.05,
            ...fm(d.fmt, "title"),
          }}
        >
          {slide.title}
        </Box>
        <Box x={0.7} y={3.6} w={6.7} h={0.55} style={{ fontFamily: LIGHT, fontSize: pt(22), color: white, ...fm(d.fmt, "subtitle") }}>
          {d.subtitle}
        </Box>
        <Box x={0.7} y={4.3} w={6.7} h={0.4} style={{ fontFamily: LIGHT, fontSize: pt(12), color: "#d9d9d9", ...fm(d.fmt, "normsLine") }}>
          {d.normsLine}
        </Box>
        <Box x={0.7} y={5.6} w={5} h={0.35} style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(13), color: white, ...fm(d.fmt, "tagline") }}>
          {d.tagline}
        </Box>
        <Box x={0.7} y={5.95} w={5} h={0.3} style={{ fontFamily: LIGHT, fontSize: pt(12), color: "#d9d9d9", ...fm(d.fmt, "dateText") }}>
          {d.dateText}
        </Box>
        <Img id={review.logoImageId} x={0.7} y={6.6} w={2.2} h={0.457} fit="contain" />
      </div>
    );
  }

  if (slide.layout === "CHAPTER") {
    const d = safeSlideData("CHAPTER", slide.data) as ChapterData;
    return (
      <div style={{ ...frame, background: c(T.chapterBg) }}>
        <Img id={slide.imageId} x={0} y={0} w={6} h={7.5} />
        <Box
          x={6.7}
          y={1.2}
          w={5.5}
          h={1.5}
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: pt(96),
            color: c(T.red),
            display: "flex",
            alignItems: "flex-end",
            lineHeight: 1,
            ...fm(d.fmt, "number"),
          }}
        >
          {d.number}
        </Box>
        <Box
          x={6.7}
          y={2.8}
          w={6.1}
          h={1.6}
          style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(38), color: white, lineHeight: 1.1, ...fm(d.fmt, "title") }}
        >
          {slide.title}
        </Box>
        <Box x={6.7} y={4.5} w={5.9} h={1.9} style={{ fontFamily: LIGHT, fontSize: pt(14), color: c(T.chapterText), lineHeight: 1.45, ...fm(d.fmt, "items") }}>
          {d.items.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </Box>
        <Img id={review.logoImageId} x={10.6} y={6.75} w={2} h={0.415} fit="contain" />
      </div>
    );
  }

  if (slide.layout === "CONCLUSION") {
    const d = safeSlideData("CONCLUSION", slide.data) as ConclusionData;
    const n = Math.max(d.columns.length, 1);
    const colW = n >= 3 ? 3.6 : n === 2 ? 5.6 : 11.9;
    const gap = n >= 3 ? 0.5 : 0.7;
    return (
      <div style={{ ...frame, background: c(T.chapterBg) }}>
        <Img id={slide.imageId} x={0} y={0} w={SLIDE_W} h={7.5} />
        <Box x={0} y={0} w={SLIDE_W} h={7.5} style={{ background: "rgba(0,0,0,.82)" }} />
        <Box
          x={0.7}
          y={0.9}
          w={6}
          h={0.35}
          style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(12), color: c(T.red), letterSpacing: pt(3), ...fm(d.fmt, "kicker") }}
        >
          {slide.kicker || slide.title}
        </Box>
        {d.columns.map((col, i) => {
          const x = 0.7 + i * (colW + gap);
          return (
            <div key={i}>
              <Box x={x} y={3.34} w={Math.min(colW, 3.6)} h={0.03} style={{ background: c(T.red) }} />
              <Box
                x={x}
                y={3.55}
                w={colW}
                h={0.8}
                style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(20), color: white, lineHeight: 1.1, ...fm(d.fmt, "colTitle") }}
              >
                {col.title}
              </Box>
              <Box x={x} y={4.45} w={colW} h={1.9} style={{ fontFamily: LIGHT, fontSize: pt(14), color: white, lineHeight: 1.25, ...fm(d.fmt, "colText") }}>
                {col.text}
              </Box>
            </div>
          );
        })}
        <Img id={review.logoImageId} x={0.7} y={6.6} w={2.2} h={0.457} fit="contain" />
      </div>
    );
  }

  const d = safeSlideData("CONTENT", slide.data) as ContentData;
  return (
    <div style={frame}>
      {slide.imageId || review.stripImageId ? (
        <Img id={slide.imageId ?? review.stripImageId} x={0} y={0} w={2.9} h={7.5} />
      ) : (
        <Box x={0} y={0} w={2.9} h={7.5} style={{ background: c(T.chapterBg) }} />
      )}
      <Box x={0} y={6.45} w={2.9} h={1.05} style={{ background: "rgba(0,0,0,.55)" }} />
      <Img id={review.logoImageId} x={0.4} y={6.72} w={2} h={0.415} fit="contain" />
      {slide.kicker && (
        <Box
          x={3.35}
          y={0.42}
          w={9.5}
          h={0.28}
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: pt(10),
            color: c(T.red),
            letterSpacing: pt(2),
            whiteSpace: "pre",
            display: "flex",
            alignItems: "center",
            ...fm(d.fmt, "kicker"),
          }}
        >
          {slide.kicker}
        </Box>
      )}
      <Box
        x={3.35}
        y={0.72}
        w={9.5}
        h={0.8}
        style={{ fontFamily: FONT, fontWeight: 700, fontSize: pt(26), color: c(T.ink), display: "flex", alignItems: "center", ...fm(d.fmt, "title") }}
      >
        {slide.title}
      </Box>
      {d.elements.map((e) => (
        <ElementPreview key={e.id} e={e} selected={e.id === selectedId} />
      ))}
      {review.footerText && (
        <Box x={3.35} y={7.02} w={6} h={0.25} style={{ fontFamily: LIGHT, fontSize: pt(8.5), color: c(T.faint) }}>
          {review.footerText}
        </Box>
      )}
      {number !== undefined && (
        <Box x={12.35} y={7.0} w={0.5} h={0.28} style={{ fontFamily: LIGHT, fontSize: pt(8.5), color: c(T.faint), textAlign: "right" }}>
          {number}
        </Box>
      )}
    </div>
  );
}
