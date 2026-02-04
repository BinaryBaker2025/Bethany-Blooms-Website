import { buildWhatsAppLink } from "../lib/contactInfo.js";

function WhatsAppFloatingButton({ hasCartNotice = false }) {
  const href = buildWhatsAppLink("Hi Bethany Blooms, I would like some help.");
  return (
    <a
      className={`floating-whatsapp ${hasCartNotice ? "floating-whatsapp--with-toast" : ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <span className="floating-whatsapp__icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" role="presentation" focusable="false">
          <path d="M13.601 2.326a7.854 7.854 0 0 0-5.588-2.33A7.935 7.935 0 0 0 .493 8.013a7.863 7.863 0 0 0 1.264 4.254L.26 16l3.829-1.457a7.877 7.877 0 0 0 3.924 1.04h.003A7.935 7.935 0 0 0 16 8.013a7.935 7.935 0 0 0-2.399-5.687ZM8.013 14.31a6.285 6.285 0 0 1-3.203-.874l-.23-.136-2.273.865.74-2.412-.149-.247a6.263 6.263 0 0 1-.967-3.34c0-3.467 2.82-6.287 6.286-6.287 1.678 0 3.258.653 4.443 1.84a6.248 6.248 0 0 1 1.837 4.443c0 3.467-2.82 6.286-6.286 6.286Zm3.446-4.423c-.189-.095-1.12-.553-1.293-.615-.173-.063-.299-.095-.425.094-.126.189-.488.615-.599.741-.11.126-.22.142-.409.047-.189-.094-.8-.294-1.524-.936-.563-.5-.943-1.117-1.053-1.305-.11-.189-.012-.291.082-.386.085-.085.189-.22.284-.331.094-.11.126-.189.189-.315.063-.126.032-.236-.016-.331-.047-.095-.425-1.025-.583-1.404-.154-.37-.311-.319-.425-.325-.11-.005-.236-.006-.362-.006a.697.697 0 0 0-.504.236c-.173.189-.661.646-.661 1.574 0 .929.677 1.826.771 1.952.094.126 1.333 2.036 3.229 2.855.451.195.803.312 1.078.399.453.144.866.124 1.192.075.364-.054 1.12-.457 1.278-.899.157-.441.157-.82.11-.899-.047-.079-.173-.126-.362-.22Z" />
        </svg>
      </span>
      <span className="floating-whatsapp__label">WhatsApp</span>
    </a>
  );
}

export default WhatsAppFloatingButton;
