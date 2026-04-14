import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import privacyPolicyMarkdown from '../../docs/privacy-policy.md?raw';
import './PrivacyPolicyPage.css';

export default function PrivacyPolicyPage() {
    return (
        <div className="pp-container">
            <div className="pp-card">
                <div className="pp-content">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                        }}
                    >
                        {privacyPolicyMarkdown}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
