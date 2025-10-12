
import React from 'react';

const SetupGuidePage = () => {
    return (
        <div>
            
            <h4>Step 1: Compile Hachimi-Unity2020</h4>
            <p>Data capture is done via a plugin for hachimi, a mod for the game. The plugin API is more recent than the latest release of Hachimi-Unity2020, so you will need to compile the current version yourself. If you need help, consult a friend or your favorite LLM. I can not provide compiled binaries for someone else's project.</p>
            <p>Once compiled, rename the DLL to <strong>winhttp.dll</strong> and place it in the root of your game folder.</p>

			<h4>Step 2: Download horseACT.dll</h4>
			<p>Download <a href="data/horseACT.dll" download><strong>horseACT.dll</strong></a> and place it in the root of your game folder. This is the hachimi plugin to capture race data.</p>
			<p style={{ marginTop: '4px', lineHeight: 0.1 }}> <small style={{ color: 'gray' }}>This will mean nothing to most of you, but this hooks the same functions as CarrotBlender so the two can not be used together.</small></p>  
			
            <h4>Step 3: Configure Hachimi</h4>
            <p>In the <strong>hachimi</strong> folder inside your game folder, open <strong>config.json</strong>. If this file does not exist, you need to launch the game at least once after installing Hachimi.</p>
            <p>Add the following entry to <strong>config.json</strong>:</p>
            <pre>
                <code style={{backgroundColor: '#343a40', color: '#f8f9fa', padding: '2px 4px', borderRadius: '4px'}}>
                    {`{
    "load_libraries": [
        "horseACT.dll"
    ]
}`}
                </code>
            </pre>

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
