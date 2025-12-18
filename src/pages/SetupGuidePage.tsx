
import React from 'react';

const SetupGuidePage = () => {
    return (
        <div>
            <div style={{ border: '1px solid #555', padding: '10px', borderRadius: '5px', marginBottom: '20px', backgroundColor: '#443333', color: '#eee' }}>
                <strong>November 11, 2025 update:</strong> Added new horseACT version supporting the new Practice Rooms, and added new hachimi information.
            </div>
            
            <h4>Step 1: Install hachimi</h4>
            <p>Data capture is done via a plugin for hachimi, a mod for the game. Run the installer from <a href="https://github.com/kairusds/Hachimi-Edge/releases/tag/v0.18.1" target="_blank" rel="noopener noreferrer">https://github.com/kairusds/Hachimi-Edge/releases/tag/v0.18.1</a> to install it.</p>
			<p>The installer likes throwing an I/O error at the end, which you can ignore if you correctly selected the game version and location.</p>
			<h4>Step 2: Download horseACT.dll</h4>
			<p>Download <a href="data/horseACT.dll" download><strong>horseACT.dll</strong></a> and place it in the root of your game folder. This is the hachimi plugin to capture race data.</p>
			<p style={{ marginTop: '4px', lineHeight: 0.1 }}> <small style={{ color: 'gray' }}>This will mean nothing to most of you, but this hooks the same functions as CarrotBlender so the two can not be used together.</small></p>  
			
            <h4>Step 3: Configure Hachimi</h4>
            <p>In the <strong>hachimi</strong> folder inside your game folder, open <strong>config.json</strong>. If this file does not exist, you need to launch the game at least once after installing Hachimi.</p>
            <p>Locate <strong>load_libraries</strong> in <strong>config.json</strong> and add <strong>"horseACT.dll"</strong> to it:</p>
            <pre>
                <code style={{backgroundColor: '#343a40', color: '#f8f9fa', padding: '2px 4px', borderRadius: '4px'}}>
                    {`{
    "load_libraries": [
        "horseACT.dll"
    ]
}`}
                </code>
            </pre>
			<p>Additionally, changing <strong>disable_auto_update_check</strong> from <strong>false</strong> to <strong>true</strong> may be a good idea since it will otherwise ask you to update on startup, but versions after 0.18.1 have issues on global (hachimi-edge is primarily meant for the JP client, it working here is a happy accident).</p>
            <h4>Step 4: To the races!</h4>
            <p>Restart your game if it's currently running. Your career and room matches (including CM) will now be saved in the <strong>Saved races</strong> folder inside of your <strong>Documents</strong> folder.</p>
            <p>If you'd like a different save location, you can specify a save path in <strong>horseACTConfig.json</strong> inside the <strong>hachimi</strong> folder.</p>

            <h4>Step 5: Parse race data</h4>
            <p>Head to the <a href="#/racedata">Race Scenario Parser</a> page and use the "Upload race" button to upload and parse your saved race files.</p>

            <h4>Bonus: Veteran data</h4>
            <p><strong>horseACTConfig.json</strong> also contains an option to dump your veteran data into the <strong>Saved races</strong> folder whenever you open your veteran list ingame, turned off by default. I don't currently do anything with this myself but kept getting questions about getting the veteran data out of the game, so anyone else is free to build something to parse it.</p>
        </div>
    );
};

export default SetupGuidePage;
