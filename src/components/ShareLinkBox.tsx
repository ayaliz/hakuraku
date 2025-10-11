import {useState} from "react";
import {InputGroup, FormControl, Button} from "react-bootstrap";

type ShareLinkBoxProps = {
    shareUrl: string,
};

export default function ShareLinkBox(props: ShareLinkBoxProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(props.shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <InputGroup className="mt-3">
            <FormControl
                readOnly
                value={props.shareUrl}
                onClick={handleCopy}
                style={{cursor: 'pointer'}}
            />
            <InputGroup.Append>
                <Button variant={copied ? "success" : "outline-secondary"} onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy"}
                </Button>
            </InputGroup.Append>
        </InputGroup>
    );
}
