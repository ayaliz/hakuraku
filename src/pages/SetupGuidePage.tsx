import React from 'react';

const SetupGuidePage = () => {
    const cardContainerStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px',
        marginBottom: '40px',
    };

    const cardStyle = {
        backgroundColor: 'var(--haku-bg-2)',
        borderRadius: 'var(--haku-radius)',
        padding: '20px',
        boxShadow: 'var(--haku-shadow)',
        border: '1px solid var(--haku-border)',
    };

    const stepTitleStyle = {
        color: '#65D283',
        fontSize: '1.1rem',
        marginBottom: '10px',
        textTransform: 'uppercase' as const,
        letterSpacing: '1px',
    };

    const linkStyle = {
        color: 'var(--haku-accent)',
        textDecoration: 'none',
        fontWeight: 'bold',
    };

    const codeBlockStyle = {
        backgroundColor: '#1e1e1e',
        color: '#a5d6a7',
        padding: '10px',
        borderRadius: '4px',
        fontFamily: "'Consolas', 'Monaco', monospace",
        fontSize: '0.9rem',
        overflowX: 'auto' as const,
        marginTop: '10px',
        whiteSpace: 'pre-wrap' as const,
    };

    const boldStyle = {
        fontWeight: 'bold' as const,
        color: '#fff',
    };

    const configSectionStyle = {
        backgroundColor: 'var(--haku-bg-2)',
        borderRadius: 'var(--haku-radius)',
        padding: '25px',
        marginTop: '30px',
        borderLeft: '4px solid #65D283',
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={cardContainerStyle}>
                {/* Step 1 */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Step 1</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>Install hachimi</h3>
                    <p>
                        Data capture is done via a plugin for <span style={boldStyle}>hachimi</span>, a mod for the game. Run the installer from{' '}
                        <a href="https://github.com/kairusds/Hachimi-Edge/releases/latest" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                            github.com/kairusds/Hachimi-Edge
                        </a>{' '}
                        to install it.
                    </p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--haku-text-muted)', fontStyle: 'italic' }}>
                        The installer likes throwing an I/O error at the end since it expects the folder structure of the japanese version, you can ignore if you correctly selected the game version and location.
                    </p>
                </div>

                {/* Step 2 */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Step 2</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>Download horseACT.dll</h3>
                    <p>
                        Download <span style={boldStyle}>horseACT.dll</span> from{' '}
                        <a href="https://github.com/ayaliz/horseACT/releases/latest" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                            github.com/ayaliz/horseACT
                        </a>{' '}
                        and place it in the root of your game folder. This is the hachimi plugin to capture race data.
                    </p>
                </div>

                {/* Step 3 */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Step 3</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>Configure Hachimi</h3>
                    <p>
                        In the <span style={boldStyle}>hachimi</span> folder inside your game folder, open <span style={boldStyle}>config.json</span>. If this file does not exist, you need to launch the game at least once after installing Hachimi.
                    </p>
                    <p>Locate <span style={boldStyle}>load_libraries</span> in <span style={boldStyle}>config.json</span> and add <span style={boldStyle}>"horseACT.dll"</span> to it:</p>
                    <div style={codeBlockStyle}>
                        {`{
    "load_libraries": [
        "horseACT.dll"
    ]
}`}
                    </div>
                </div>

                {/* Step 4 */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Step 4</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>To the races!</h3>
                    <p>
                        Restart your game if it's currently running. Your career and room matches (including CM) will now be saved in the <span style={boldStyle}>Saved races</span> folder inside of your{' '}
                        <span style={boldStyle}>Documents</span> folder.
                    </p>
                    <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
                        If you'd like a different save location, see the config section at the bottom of the page.
                    </p>
                </div>

                {/* Step 5 */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Step 5</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>Parse race data</h3>
                    <p>
                        Head to the{' '}
                        <a href="#/racedata" style={linkStyle}>
                            Race Scenario Parser
                        </a>{' '}
                        page and use the "Upload race" button to upload and parse your saved race files.
                    </p>
                </div>

                {/* Bonus */}
                <div style={cardStyle}>
                    <div style={stepTitleStyle}>Bonus</div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#f0f0f0' }}>Veteran data</h3>
                    <p>
                        <span style={boldStyle}>horseACT</span> will also dump your veteran data to <span style={boldStyle}>veteran.json</span> inside the <span style={boldStyle}>Saved races</span> folder.
                    </p>
                    <p>
                        Head to the{' '}
                        <a href="#/veterans" style={linkStyle}>
                            Veteran page
                        </a>{' '}
                        if you'd like to filter your veteran Umas to find specific spark combinations.
                    </p>
                </div>
            </div>

            <div style={configSectionStyle}>
                <h2 style={{ borderBottom: '1px solid var(--haku-border)', paddingBottom: '10px', marginBottom: '20px', color: '#fff' }}>horseACT Configuration</h2>
                <p>
                    Inside your <span style={boldStyle}>hachimi</span> folder, you will find <span style={boldStyle}>horseACTConfig.json</span> after launching the game with horseACT installed. Inside, you will find the following entries:
                </p>
                <ul style={{ listStyleType: 'none', padding: 0 }}>
                    <li style={{ marginBottom: '15px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a5c9b8' }}>outputPath</div>
                        The location of the "Saved races" folder.
                    </li>
                    <li style={{ marginBottom: '15px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a5c9b8' }}>enableLogging</div>
                        Disabled by default. If enabled, horseACT writes a log file to the hachimi folder with potentially useful information for troubleshooting should you run into any issues.
                    </li>
                    <li style={{ marginBottom: '15px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a5c9b8' }}>dumpStaticVariableDefine</div>
                        Disabled by default. If enabled, horseACT dumps the contents of StaticVariableDefine when you enter a race. Leave off unless you have use for what's in there (potentially crash prone on game updates).
                    </li>
                    <li style={{ marginBottom: '15px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a5c9b8' }}>dumpEnums</div>
                        Disabled by default. If enabled, horseACT dumps race related enums when you enter a race. Leave off unless you have use for what's in there (potentially crash prone on game updates).
                    </li>
                    <li style={{ marginBottom: '15px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a5c9b8' }}>fieldBlacklist</div>
                        A list of fields that are skipped when dumping race/veteran data. By default, blacklists fields with potentially identifiable information like your ingame ID, as well as fields containing duplicate copies of the race scenario data to significantly reduce the file size of saved races.
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default SetupGuidePage;
