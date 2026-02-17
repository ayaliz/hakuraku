import {useState} from "react";
import {OverlayTrigger, Tooltip} from "react-bootstrap";

type CopyButtonProps = {
    content: string,
};

export default function CopyButton(props: CopyButtonProps) {
    const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

    return <OverlayTrigger show={showCopiedTooltip} placement="bottom"
                           overlay={<Tooltip id="copied-overlay">Copied!</Tooltip>}>
            <span className="copy-button"
                  onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(props.content)
                          .then(() => {
                              setShowCopiedTooltip(true);
                              setTimeout(() => setShowCopiedTooltip(false), 800);
                          });
                  }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                    <path d="M0 0h24v24H0z" fill="none"/>
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
        </span>
    </OverlayTrigger>;
}
