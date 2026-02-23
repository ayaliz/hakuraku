import './SetupGuidePage.css';

const SetupGuidePage = () => {
    return (
        <div className="sg-container">
            <div className="sg-card-container">
                {/* Step 1 */}
                <div className="sg-card">
                    <div className="sg-step-title">Step 1</div>
                    <h3 className="sg-card-heading">Install hachimi</h3>
                    <p>
                        Data capture is done via a plugin for <span className="sg-bold">hachimi</span>, a mod for the game. Run the installer from{' '}
                        <a href="https://github.com/kairusds/Hachimi-Edge/releases/latest" target="_blank" rel="noopener noreferrer" className="sg-link">
                            github.com/kairusds/Hachimi-Edge
                        </a>{' '}
                        to install it.
                    </p>
                    <p className="sg-subtext">
                        The installer likes throwing an I/O error at the end since it expects the folder structure of the japanese version, you can ignore if you correctly selected the game version and location.
                    </p>
                </div>

                {/* Step 2 */}
                <div className="sg-card">
                    <div className="sg-step-title">Step 2</div>
                    <h3 className="sg-card-heading">Download horseACT.dll</h3>
                    <p>
                        Download <span className="sg-bold">horseACT.dll</span> from{' '}
                        <a href="https://github.com/ayaliz/horseACT/releases/latest" target="_blank" rel="noopener noreferrer" className="sg-link">
                            github.com/ayaliz/horseACT
                        </a>{' '}
                        and place it in the root of your game folder. This is the hachimi plugin to capture race data.
                    </p>
                </div>

                {/* Step 3 */}
                <div className="sg-card">
                    <div className="sg-step-title">Step 3</div>
                    <h3 className="sg-card-heading">Configure Hachimi</h3>
                    <p>
                        In the <span className="sg-bold">hachimi</span> folder inside your game folder, open <span className="sg-bold">config.json</span>. If this file does not exist, you need to launch the game at least once after installing Hachimi.
                    </p>
                    <p>Locate <span className="sg-bold">load_libraries</span> in <span className="sg-bold">config.json</span> and add <span className="sg-bold">"horseACT.dll"</span> to it:</p>
                    <div className="sg-code-block">
                        {`{
    "load_libraries": [
        "horseACT.dll"
    ]
}`}
                    </div>
                </div>

                {/* Step 4 */}
                <div className="sg-card">
                    <div className="sg-step-title">Step 4</div>
                    <h3 className="sg-card-heading">To the races!</h3>
                    <p>
                        Restart your game if it's currently running. Your career and room matches (including CM) will now be saved in the <span className="sg-bold">Saved races</span> folder inside of your{' '}
                        <span className="sg-bold">Documents</span> folder.
                    </p>
                    <p className="sg-margin-top">
                        If you'd like a different save location, see the config section at the bottom of the page.
                    </p>
                </div>

                {/* Step 5 */}
                <div className="sg-card">
                    <div className="sg-step-title">Step 5</div>
                    <h3 className="sg-card-heading">Parse race data</h3>
                    <p>
                        Head to the{' '}
                        <a href="#/racedata" className="sg-link">
                            Race Scenario Parser
                        </a>{' '}
                        page and use the "Upload race" button to upload and parse your saved race files.
                    </p>
                </div>

                {/* Bonus */}
                <div className="sg-card">
                    <div className="sg-step-title">Bonus</div>
                    <h3 className="sg-card-heading">Veteran data</h3>
                    <p>
                        <span className="sg-bold">horseACT</span> will also dump your veteran data to <span className="sg-bold">veteran.json</span> inside the <span className="sg-bold">Saved races</span> folder.
                    </p>
                    <p>
                        Head to the{' '}
                        <a href="#/veterans" className="sg-link">
                            Veteran page
                        </a>{' '}
                        if you'd like to filter your veteran Umas to find specific spark combinations.
                    </p>
                </div>
            </div>

            <div className="sg-config-section">
                <h2 className="sg-config-title">horseACT Configuration</h2>
                <p>
                    Inside your <span className="sg-bold">hachimi</span> folder, you will find <span className="sg-bold">horseACTConfig.json</span> after launching the game with horseACT installed. Inside, you will find the following entries:
                </p>
                <ul className="sg-config-list">
                    <li className="sg-config-item">
                        <div className="sg-config-item-title">outputPath</div>
                        The location of the "Saved races" folder.
                    </li>
                    <li className="sg-config-item">
                        <div className="sg-config-item-title">enableLogging</div>
                        Disabled by default. If enabled, horseACT writes a log file to the hachimi folder with potentially useful information for troubleshooting should you run into any issues.
                    </li>
                    <li className="sg-config-item">
                        <div className="sg-config-item-title">dumpStaticVariableDefine</div>
                        Disabled by default. If enabled, horseACT dumps the contents of StaticVariableDefine when you enter a race. Leave off unless you have use for what's in there (potentially crash prone on game updates).
                    </li>
                    <li className="sg-config-item">
                        <div className="sg-config-item-title">dumpEnums</div>
                        Disabled by default. If enabled, horseACT dumps race related enums when you enter a race. Leave off unless you have use for what's in there (potentially crash prone on game updates).
                    </li>
                    <li className="sg-config-item">
                        <div className="sg-config-item-title">fieldBlacklist</div>
                        A list of fields that are skipped when dumping race/veteran data. By default, blacklists fields with potentially identifiable information like your ingame ID, as well as fields containing duplicate copies of the race scenario data to significantly reduce the file size of saved races.
                    </li>
                </ul>
            </div>
        </div >
    );
};

export default SetupGuidePage;
