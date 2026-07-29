'use client';

import { useGameStore } from '@/lib/store';
import { X } from 'lucide-react';

export default function SettingsModal() {
  const { settings, setSettings, ui, setShowSettings, saveGame } = useGameStore();

  if (!ui.showSettings) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
          <h2 className="text-xl font-bold text-white tracking-wider">SYSTEM SETTINGS</h2>
          <button 
            onClick={() => setShowSettings(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Graphics Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-widest">Graphics</h3>
            
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Resolution Scale</label>
              <select 
                value={settings.resolution}
                onChange={(e) => setSettings({ resolution: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white p-2 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="144p">144p</option>
                <option value="240p">240p</option>
                <option value="360p">360p</option>
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">FPS Target</label>
              <select 
                value={settings.fps}
                onChange={(e) => setSettings({ fps: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 text-white p-2 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value={15}>15 FPS (Battery Saver)</option>
                <option value={30}>30 FPS</option>
                <option value={45}>45 FPS</option>
                <option value={60}>60 FPS</option>
                <option value={75}>75 FPS</option>
                <option value={90}>90 FPS</option>
                <option value={120}>120 FPS</option>
                <option value={144}>144 FPS</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Dynamic Shadows</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.shadows}
                  onChange={(e) => setSettings({ shadows: e.target.checked })}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Controls Settings Placeholder */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-widest">Controls</h3>
            <p className="text-xs text-gray-500">Auto-detected inputs: Keyboard, Mouse, Touch</p>
          </div>

        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-950 flex gap-4">
          <button 
            onClick={() => {
              saveGame();
              setShowSettings(false);
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
