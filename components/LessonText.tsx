// Lesson text written in the small markdown the AI and the editor use:
// "#"/"##"/"###" headings, "- " bullets, "1. " numbered lines, **bold**, "> " callout box,
// blank line between paragraphs. Rendered as React text, never as HTML, so a
// lesson can never inject markup into the page.

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

export default function LessonText({ body }: { body: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1 my-3`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>
    );
    list = null;
  };
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•] (.*)$/.exec(line);
    const numbered = /^\d+[.)] (.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("> ")) {
      const warn = /^> ?(⚠️|❗|🚫)/u.test(line);
      blocks.push(
        <div key={blocks.length} className={`my-3 rounded-lg border-l-4 px-4 py-3 ${warn ? "border-amber-400 bg-amber-50 text-amber-900" : "border-sky-400 bg-sky-50 text-sky-900"}`}>
          {inline(line.slice(2))}
        </div>
      );
      continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      const size = h[1].length === 1 ? "text-xl" : h[1].length === 2 ? "text-lg" : "text-base";
      blocks.push(<h3 key={blocks.length} className={`${size} font-semibold text-dark mt-5 mb-2`}>{inline(h[2])}</h3>);
    } else {
      blocks.push(<p key={blocks.length} className="my-2 leading-relaxed">{inline(line)}</p>);
    }
  }
  flush();
  return <div className="text-sm text-gray-700">{blocks}</div>;
}
