# Spotify Game Autopilot

Spotify Game Autopilot is a Node.js application that automatically changes your Spotify music based on the game you're currently playing. When you launch a configured game, the application detects it and starts playing a predefined playlist that matches the game's atmosphere.

## Features

- Automatically detects when configured games are launched
- Switches to game-specific playlists when games are detected
- Authorization with Spotify API for playback control
- Token persistence for easy reconnection
- Customizable game-to-playlist mapping

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or newer)
- [Spotify Premium account](https://www.spotify.com/premium/) (required for playback control)
- [Spotify Developer App](https://developer.spotify.com/dashboard/)

## Installation

1. Clone this repository or download the source code:
```bash
git clone https://github.com/yourusername/spotify-game-autopilot.git
cd spotify-game-autopilot
```

2. Install the required dependencies:
```bash
npm install express request open node-fetch
```

3. Create a Spotify Developer App:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   - Log in with your Spotify account
   - Click "Create An App"
   - Fill in the app name (e.g., "Game Music Autopilot") and description
   - Once created, note your Client ID and Client Secret
   - Add `http://localhost:8888/callback` as a Redirect URI in your app settings

4. Update the configuration in `index.js`:
   - Replace `YOUR_CLIENT_ID` and `YOUR_CLIENT_SECRET` with your Spotify app credentials
   - Update the `gameConfigs` object with your games and preferred playlists

## Usage

1. Start the application:
```bash
node index.js
```

2. On first run, a browser window will open asking you to authorize the application with your Spotify account. Log in and approve the permissions.

3. After authorization, the application will start monitoring for your configured games.

4. Launch one of your configured games, and the application will automatically switch your Spotify playback to the corresponding playlist.

## Game Configuration

The application uses a configuration object to map game executables to Spotify playlists. You can customize this in the `gameConfigs` object:

```javascript
const gameConfigs = {
  'csgo.exe': '37i9dQZF1DX8CopunbDxgW',  // CS:GO with FPS gaming playlist
  'cs2.exe': '37i9dQZF1DX8CopunbDxgW',  // CS2 with the same playlist
  'valorant.exe': '37i9dQZF1DX1L0MDB0oGJq',  // Valorant with a different playlist
  // Add more games here
};
```

To find a playlist ID:
1. Open Spotify
2. Navigate to the playlist you want to use
3. Click the three dots (...)
4. Go to "Share" → "Copy link to playlist"
5. The link will look like `https://open.spotify.com/playlist/37i9dQZF1DX8CopunbDxgW`
6. The playlist ID is the part after `/playlist/`

## Running on Startup

To have the application run automatically when you start your computer:

### Windows
1. Create a batch file (e.g., `start-spotify-autopilot.bat`) with the following content:
```batch
@echo off
cd path\to\spotify-game-autopilot
node index.js
```
2. Press `Win+R`, type `shell:startup`, and press Enter
3. Copy the batch file to the startup folder that opens

## Troubleshooting

### Playback doesn't start
- Make sure Spotify is running on your device
- Ensure you have a Spotify Premium account (required for the Spotify API playback controls)
- Check if your Spotify account is authorized with the application

### Game not detected
- Verify that the exact executable name is in the `gameConfigs` object
- Run `tasklist` in Command Prompt to see the exact process names of running games

### Authorization errors
- Ensure your Client ID and Client Secret are correct
- Verify that the redirect URI is properly configured in your Spotify Developer App settings

## License

MIT
