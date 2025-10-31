import { useEffect } from "react";

export function usePageMetadata({ title, description }) {
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
}
