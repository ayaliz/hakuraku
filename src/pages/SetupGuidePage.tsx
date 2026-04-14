import { useEffect } from 'react';
import './SetupGuidePage.css';

const HORSEACT_SETUP_URL = 'https://github.com/ayaliz/horseACT#installation';

const SetupGuidePage = () => {
    useEffect(() => {
        window.location.replace(HORSEACT_SETUP_URL);
    }, []);

    return (
        <div className="sg-page">
            <p>
                Redirecting to the horseACT setup guide on GitHub.
            </p>
            <p>
                If you are not redirected automatically, open{' '}
                <a href={HORSEACT_SETUP_URL} target="_blank" rel="noopener noreferrer">
                    {HORSEACT_SETUP_URL}
                </a>
                .
            </p>
        </div>
    );
};

export default SetupGuidePage;
