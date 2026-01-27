import { useEffect } from "react";

export function usePageMetadata({ title, description, keywords }) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
    if (!description) return;

    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", description);
    } else {
      const element = document.createElement("meta");
      element.name = "description";
      element.content = description;
      document.head.appendChild(element);
    }

    return () => {
      // optional cleanup not needed so left empty
    };
  }, [title, description]);

  useEffect(() => {
    if (!keywords) return;
    const content = Array.isArray(keywords) ? keywords.join(", ") : keywords;
    if (!content) return;
    const meta = document.querySelector('meta[name="keywords"]');
    if (meta) {
      meta.setAttribute("content", content);
    } else {
      const element = document.createElement("meta");
      element.name = "keywords";
      element.content = content;
      document.head.appendChild(element);
    }
  }, [keywords]);
}
