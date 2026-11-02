"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { NameSpellcheck, nameSpellcheckKey, nameWords } from "@/lib/nameSpellcheck";
import { PersonTag } from "@/lib/personTagMark";
import { authFetch } from "@/lib/useAuth";
import { imageSize } from "@/lib/minutesPaste";
import { cleanDoc, docToText, stableDoc, textToDoc, imageSrc, FONTS, FONT_SIZES, type RichNode } from "@/lib/richDoc";
import { useT } from "@/components/I18nProvider";
import { tk } from "@/lib/i18n/translate";

// A minutes section you format the way you would in Word. Carl: "bold,
// italics, underlining, coloured font, changing font types, highlighting
// text etc. basically, anything a word doc can do to edit font/text".
//
// What it reports is ALWAYS cleanDoc'd first, the same rebuild the server
// does, so the page's "unsaved?" check and the saved copy cannot disagree.

const HIGHLIGHTS = ["#fff59d", "#c8e6c9", "#bbdefb", "#f8bbd0", "#ffe0b2"];

/** Uploads a picture for these minutes; its address and natural size. */
async function uploadPicture(minutesId: string, file: File): Promise<{ src: string; width: number; height: number }> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error(tk("Add a PNG or JPEG picture (a screenshot is usually PNG)."));
  const size = await imageSize(file).catch(() => ({ width: 800, height: 600 }));
  const form = new FormData();
  form.append("file", file);
  const res = await authFetch(`/api/minutes/${minutesId}/images`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || tk("Could not add that picture."));
  return { src: imageSrc(minutesId, data.id), ...size };
}

export default function RichTextEditor({
  minutesId,
  doc,
  body,
  placeholder,
  onChange,
  onReady,
  names,
  people,
}: {
  minutesId: string;
  doc?: RichNode;
  body: string;
  placeholder?: string;
  onChange: (doc: RichNode, body: string) => void;
  /** Hands the editor up, so "+ Add to action items" can read the cursor. */
  onReady?: (editor: Editor | null) => void;
  /** Names on the People register: never marked as misspelt. */
  names?: string[];
  /** The People register, for tagging selected text with a person. */
  people?: { id: string; name: string }[];
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(0);
  // What this editor last reported, so a change coming back down from the
  // page (a restore, someone else's save) can be told from its own echo.
  const emitted = useRef<string>(doc ? stableDoc(doc) : "");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // The register's name words, read by the spell-check extension on each rebuild.
  const words = useRef<Set<string>>(new Set());

  // The editor, for the paste and drop handlers (set once it exists).
  const editorRef = useRef<Editor | null>(null);
  // The document this editor last reported, by reference.
  const lastDoc = useRef<RichNode | undefined>(doc);

  const addPictures = async (ed: Editor, files: File[], at?: number) => {
    // 🔴 Where the picture belongs, kept up to date as the person carries on
    // typing during the upload. Inserting at the selection as it is when the
    // upload FINISHES would replace whatever they had selected by then.
    let pos = at ?? ed.state.selection.to;
    const follow = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }) => {
      pos = transaction.mapping.map(pos);
    };
    ed.on("transaction", follow);
    try {
      for (const file of files) {
        setBusy((n) => n + 1);
        setNote("");
        try {
          const p = await uploadPicture(minutesId, file);
          if (ed.isDestroyed) return;
          const node = { type: "image", attrs: { src: p.src, width: p.width, height: p.height } };
          ed.chain().insertContentAt(Math.min(pos, ed.state.doc.content.size), node).run();
        } catch (e) {
          setNote(t((e as Error).message));
        } finally {
          setBusy((n) => n - 1);
        }
      }
    } finally {
      ed.off("transaction", follow);
    }
  };

  const editor = useEditor({
    // Next renders on the server first; the editor only exists in the browser.
    immediatelyRender: false,
    // TipTap 3 does not redraw on a cursor move by default; the toolbar must.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, blockquote: false, horizontalRule: false, link: false }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.extend({
        addAttributes() {
          return { ...this.parent?.(), width: { default: null }, height: { default: null } };
        },
      }).configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      // eslint-disable-next-line react-hooks/refs -- read inside the plugin later, never during render
      NameSpellcheck(() => words.current),
      PersonTag,
    ],
    content: doc ?? textToDoc(body, minutesId),
    editorProps: {
      attributes: {
        class: "rich-minutes min-h-[7rem] px-3 py-2 text-sm text-gray-800 focus:outline-none",
      },
      // A pasted or dropped screenshot is uploaded. Copying TEXT from Office
      // also carries a picture of it: text wins, so the words arrive as words.
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        const hasText = !!event.clipboardData?.getData("text/plain").trim();
        if (/<img[^>]+src=["']?(file:|cid:)/i.test(event.clipboardData?.getData("text/html") ?? "")) {
          setNote(t("Pictures inside pasted Word text do not come across. Paste each picture on its own, or use Picture."));
        }
        if (!files.length || hasText) return false;
        if (editorRef.current) addPictures(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
        if (editorRef.current) addPictures(editorRef.current, files, at);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const clean = cleanDoc(ed.getJSON(), minutesId);
      if (!clean) {
        setNote(t("This section is too long to save. Split it into two sections."));
        return;
      }
      setNote((n) => (n === t("This section is too long to save. Split it into two sections.") ? "" : n));
      lastDoc.current = clean;
      emitted.current = stableDoc(clean);
      onChangeRef.current(clean, docToText(clean));
    },
  });
  useEffect(() => {
    editorRef.current = editor;
    onReady?.(editor);
    return () => onReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // The names usually arrive after the editor: re-mark the text when they do.
  const namesKey = (names ?? []).join("|");
  useEffect(() => {
    words.current = nameWords(namesKey ? namesKey.split("|") : []);
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(nameSpellcheckKey, true));
  }, [namesKey, editor]);

  // A change from outside (a backup restored, the newer copy loaded after a
  // save conflict) is put into the editor; its own typing coming back is not.
  useEffect(() => {
    if (!editor || (doc && doc === lastDoc.current)) return;
    const incoming = doc ?? textToDoc(body, minutesId);
    const key = stableDoc(cleanDoc(incoming, minutesId) ?? incoming);
    if (key === emitted.current) return;
    if (doc && key === stableDoc(cleanDoc(editor.getJSON(), minutesId) ?? doc)) return;
    emitted.current = key;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [doc, body, editor, minutesId]);

  if (!editor) return <div className="min-h-[7rem] rounded-lg border border-gray-200" />;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-sm border ${active ? "bg-primary/10 border-primary text-dark" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // the selection stays put
  const style = editor.getAttributes("textStyle");
  const inTable = editor.isActive("table");

  return (
    <div className="rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-primary">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title={t("Bold")} aria-label={t("Bold")}>
          <b>B</b>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title={t("Italic")} aria-label={t("Italic")}>
          <i>I</i>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} title={t("Underline")} aria-label={t("Underline")}>
          <u>U</u>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} title={t("Strikethrough")} aria-label={t("Strikethrough")}>
          <s>S</s>
        </button>

        <select
          aria-label={t("Font")}
          value={style.fontFamily ?? ""}
          onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())}
          className="px-1.5 py-1 rounded border border-gray-200 text-sm bg-white"
        >
          <option value="">{t("Font")}</option>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Size")}
          value={style.fontSize ?? ""}
          onChange={(e) => (e.target.value ? editor.chain().focus().setFontSize(e.target.value).run() : editor.chain().focus().unsetFontSize().run())}
          className="px-1.5 py-1 rounded border border-gray-200 text-sm bg-white"
        >
          <option value="">{t("Size")}</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s.replace("pt", "")}
            </option>
          ))}
        </select>

        <label className={btn(false) + " cursor-pointer flex items-center gap-1"} title={t("Text colour")}>
          <span style={{ color: style.color || "#111827" }} className="font-bold">A</span>
          <input
            type="color"
            aria-label={t("Text colour")}
            value={style.color || "#111827"}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="h-4 w-5 cursor-pointer border-0 p-0"
          />
        </label>
        <span className="flex items-center gap-0.5" title={t("Highlight")}>
          {HIGHLIGHTS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={keep}
              onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
              aria-label={t("Highlight")}
              className={`h-5 w-5 rounded border ${editor.isActive("highlight", { color: c }) ? "border-gray-700" : "border-gray-200"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </span>

        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title={t("Bullets")} aria-label={t("Bullets")}>
          •≡
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title={t("Numbering")} aria-label={t("Numbering")}>
          1.≡
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading"))} title={t("Heading")} aria-label={t("Heading")}>
          H
        </button>

        {!inTable ? (
          <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className={btn(false)} title={t("Insert a table")}>
            ▦ {t("Table")}
          </button>
        ) : (
          <>
            <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().addRowAfter().run()} className={btn(false)}>+ {t("Row")}</button>
            <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().addColumnAfter().run()} className={btn(false)}>+ {t("Column")}</button>
            <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().deleteRow().run()} className={btn(false)}>− {t("Row")}</button>
            <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().deleteColumn().run()} className={btn(false)}>− {t("Column")}</button>
            <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().deleteTable().run()} className={btn(false)}>{t("Delete table")}</button>
          </>
        )}

        <label className={btn(false) + " cursor-pointer"} title={t("+ Add a picture")}>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) addPictures(editor, files);
            }}
          />
          🖼 {busy ? t("Adding the picture...") : t("Picture")}
        </label>
        {editor.isActive("personTag") ? (
          <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().extendMarkRange("personTag").unsetMark("personTag").run()} className={btn(true)}>
            👤 {t("Untag {name}", { name: String(editor.getAttributes("personTag").name ?? "") })}
          </button>
        ) : (
          !!people?.length && (
            <select
              aria-label={t("Tag person")}
              value=""
              onChange={(e) => {
                const p = people.find((x) => x.id === e.target.value);
                if (!p) return;
                if (editor.state.selection.empty) {
                  setNote(t("Select the words first, then pick the person."));
                  return;
                }
                setNote("");
                editor.chain().focus().setMark("personTag", { id: p.id, name: p.name }).run();
              }}
              className="px-1.5 py-1 rounded border border-gray-200 text-sm bg-white"
            >
              <option value="">👤 {t("Tag person")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )
        )}
        <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} title={t("Clear formatting")}>
          {t("Clear formatting")}
        </button>
      </div>
      <EditorContent editor={editor} />
      {note && <p className="px-3 pb-2 text-xs text-red-600">{note}</p>}
    </div>
  );
}
