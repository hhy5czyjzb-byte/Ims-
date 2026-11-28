"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  defaultValue: string;
  /** Afbeelding uploaden; geeft het adres terug (of een foutmelding). */
  onUploadImage?: (fd: FormData) => Promise<{ error?: string; src?: string }>;
  label?: string;
};

/**
 * Eenvoudige teksteditor (vet, cursief, kopje, opsommingen, link, afbeelding). De HTML gaat via een verborgen veld
 * mee met het formulier en wordt op de server opgeschoond; alleen veilige opmaak blijft over.
 */
export function RichTextEditor({ name, defaultValue, onUploadImage, label = "Tekst" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = defaultValue;
    if (hidden.current) hidden.current.value = defaultValue;
  }, [defaultValue]);

  const sync = () => {
    if (hidden.current && ref.current) hidden.current.value = ref.current.innerHTML;
  };
  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand(cmd, false, value);
    sync();
  };
  const addLink = () => {
    const url = window.prompt("Adres van de link (https://…)", "https://");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      setMessage("Een link moet beginnen met https://, http:// of mailto:");
      return;
    }
    exec("createLink", url);
  };
  const onFile = async (file: File | undefined) => {
    if (!file || !onUploadImage) return;
    setBusy(true);
    setMessage(null);
    const fd = new FormData();
    fd.append("image", file);
    const r = await onUploadImage(fd);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.error || !r.src) {
      setMessage(r.error ?? "Uploaden mislukt.");
      return;
    }
    exec("insertImage", r.src);
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
    >
      {children}
    </button>
  );

  return (
    <div>
      <span className="label">{label}</span>
      <div className="rounded-md border border-neutral-300 bg-white focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/20">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-1 py-1" role="toolbar" aria-label="Opmaak">
          <Btn onClick={() => exec("bold")} title="Vet">
            <strong>B</strong>
          </Btn>
          <Btn onClick={() => exec("italic")} title="Cursief">
            <em>I</em>
          </Btn>
          <Btn onClick={() => exec("formatBlock", "h3")} title="Tussenkop">
            Kop
          </Btn>
          <Btn onClick={() => exec("formatBlock", "p")} title="Gewone tekst">
            Tekst
          </Btn>
          <Btn onClick={() => exec("insertUnorderedList")} title="Opsomming">
            • Lijst
          </Btn>
          <Btn onClick={() => exec("insertOrderedList")} title="Genummerde lijst">
            1. Lijst
          </Btn>
          <Btn onClick={addLink} title="Link">
            Link
          </Btn>
          <Btn onClick={() => exec("unlink")} title="Link weghalen">
            Link weg
          </Btn>
          {onUploadImage && (
            <>
              <Btn onClick={() => fileRef.current?.click()} title="Afbeelding invoegen">
                {busy ? "Bezig…" : "Afbeelding"}
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </>
          )}
          <Btn onClick={() => exec("undo")} title="Ongedaan maken">
            ↶
          </Btn>
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          onInput={sync}
          onBlur={sync}
          className="doc max-h-[70vh] min-h-40 overflow-y-auto px-3 py-2 outline-none"
        />
      </div>
      <input ref={hidden} type="hidden" name={name} defaultValue={defaultValue} />
      {message && <p className="mt-1 text-xs text-brand-red-dark">{message}</p>}
      <p className="mt-1 text-xs text-neutral-500">
        Tabellen en afbeeldingen uit Word blijven staan. Plakken uit Word kan; opmaak die niet past wordt bij opslaan weggehaald.
      </p>
    </div>
  );
}
