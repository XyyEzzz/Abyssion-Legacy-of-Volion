'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import { HudElementId, HUD_ELEMENT_LABELS } from '@/lib/hudConfig';
import { useTranslation } from '@/lib/useTranslation';
import { X, RotateCcw, Pencil, Eye, EyeOff, Bug, Activity, Users, MessageSquare, LogOut } from 'lucide-react';

type TabId = 'general' | 'graphics' | 'language' | 'controls' | 'debug';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'language', label: 'Language' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'controls', label: 'Controls' },
  { id: 'debug', label: 'Debug Mode' },
];

export default function SettingsModal() {
  const { settings, setSettings, ui, setShowSettings, saveGame, debug, activeDialogue, hudLayout, setHudElement, resetHudElement, resetHudLayout, setHudEditMode, returnToMenu, cheat, setCheatConsoleOpen } = useGameStore();
  const { tl } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settingsSnapshot] = useState(() => ({ ...settings }));
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  if (!ui.showSettings) return null;

  const hasUnchangedSettings = (
    settings.cameraMode === settingsSnapshot.cameraMode &&
    settings.cameraSensitivity === settingsSnapshot.cameraSensitivity &&
    settings.resolution === settingsSnapshot.resolution &&
    settings.fps === settingsSnapshot.fps &&
    settings.shadows === settingsSnapshot.shadows &&
    settings.debugMode === settingsSnapshot.debugMode &&
    settings.fMode === settingsSnapshot.fMode &&
    settings.language === settingsSnapshot.language
  );

  const handleClose = () => {
    if (!hasUnchangedSettings) {
      setShowDiscardDialog(true);
    } else {
      setShowSettings(false);
    }
  };

  const hudElementIds = Object.keys(HUD_ELEMENT_LABELS) as HudElementId[];

  const toggleHudElement = (id: HudElementId) => {
    setHudElement(id, { visible: !hudLayout[id].visible });
  };

  const trueFalseBadge = (value: boolean) => (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-bold ${
        value
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'bg-slate-800 text-slate-400 border border-slate-700'
      }`}
    >
      {value ? 'TRUE' : 'FALSE'}
    </span>
  );

  const infoRow = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between items-center gap-3">
      <span className="text-sm text-gray-300">{label}</span>
      <span className="font-mono text-sm text-gray-100">{value}</span>
    </div>
  );

  const tabButton = (tab: { id: TabId; label: string }) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
        activeTab === tab.id
          ? 'text-amber-200 border-amber-600 bg-stone-800/60'
          : 'text-stone-400 border-transparent hover:text-amber-100/80 hover:bg-stone-800/30'
      }`}
    >
      {tab.label}
    </button>
  );

  const sectionTitle = (label: string) => (
    <h3 className="text-sm font-semibold text-amber-400/90 uppercase tracking-widest">{label}</h3>
  );

  const selectClass = 'w-full bg-stone-800 border border-amber-900/60 text-amber-50 p-2 focus:outline-none focus:border-amber-500 rounded';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black backdrop-blur-sm p-4">
      <div className="bg-stone-900 border border-amber-900/50 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col rounded-lg">
        {/* Header */}
        <div className="p-4 border-b border-amber-900/40 flex justify-between items-center bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950">
          <h2 className="text-xl font-bold text-white tracking-wider">{tl('settings.title')}</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-amber-900/40 bg-stone-950">
          {TABS.map(tabButton)}
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">

          {/* ── GENERAL ── */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Sensitivity (P1.6): lives in General — the separate
                  Sensitivity category was removed. */}
              <div className="space-y-4">
                {sectionTitle('Sensitivity')}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-300">Camera Sensitivity</label>
                    <span className="font-mono text-sm text-gray-100 tabular-nums">{settings.cameraSensitivity.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={3.0}
                    step={0.05}
                    value={settings.cameraSensitivity}
                    onChange={(e) => setSettings({ cameraSensitivity: Number(e.target.value) })}
                    className="w-full accent-amber-600"
                  />
                  <p className="text-xs text-gray-500">Controls how fast the camera rotates in response to touch or mouse drag. Higher values rotate faster.</p>
                </div>
              </div>

              {/* Camera Settings */}
              <div className="space-y-4">
                {sectionTitle(tl('settings.camera'))}

                <div className="space-y-2">
                  <label className="text-sm text-gray-300">Camera Mode</label>
                  <select
                    value={settings.cameraMode}
                    onChange={(e) => setSettings({ cameraMode: e.target.value as 'third' | 'second' | 'first' })}
                    className={selectClass}
                  >
                    <option value="third">Third Person</option>
                    <option value="second">Second Person</option>
                    <option value="first">First Person</option>
                  </select>
                </div>
              </div>

              {/* HUD Customization */}
              <div className="space-y-4 border-t border-gray-800 pt-5">
                <div className="flex items-center justify-between">
                  {sectionTitle(tl('settings.customizeHud'))}
                  <button
                    onClick={() => resetHudLayout()}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                  >
                    <RotateCcw size={12} />
                    {tl('settings.resetAll')}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setShowSettings(false);
                    setHudEditMode(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 transition-colors"
                >
                  <Pencil size={15} />
                  {tl('settings.editHudLayout')}
                </button>

                <div className="bg-gray-950/50 border border-gray-800 p-4 space-y-2">
                  {hudElementIds.map((id) => (
                    <div key={id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{HUD_ELEMENT_LABELS[id]}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => resetHudElement(id)}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                          title="Reset this element"
                        >
                          <RotateCcw size={12} />
                        </button>
                        <button
                          onClick={() => toggleHudElement(id)}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                          title={hudLayout[id].visible ? 'Hide' : 'Show'}
                        >
                          {hudLayout[id].visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── GRAPHICS ── */}
          {activeTab === 'graphics' && (
            <div className="space-y-4">
              {sectionTitle('Graphics')}

              {/* Resolution Scale (P1.7 truthfulness): the renderer does not
                  consume this setting yet — displayed as future functionality
                  rather than a control that pretends to work. */}
              <div className="space-y-2 opacity-60">
                <label className="text-sm text-gray-300">Resolution Scale</label>
                <select disabled value="" className={`${selectClass} cursor-not-allowed`}>
                  <option value="">Not yet implemented</option>
                </select>
                <p className="text-xs text-gray-500">
                  Planned: renderer resolution scaling for low-spec devices. This control currently has no runtime effect, so it is disabled here.
                </p>
              </div>

              {/* FPS Target (P1.7 truthfulness): no frame limiter consumes
                  this setting yet — represented as future functionality. */}
              <div className="space-y-2 opacity-60">
                <label className="text-sm text-gray-300">FPS Target</label>
                <select disabled value="" className={`${selectClass} cursor-not-allowed`}>
                  <option value="">Not yet implemented</option>
                </select>
                <p className="text-xs text-gray-500">
                  Planned: an actual frame limiter. No runtime code constrains the frame rate today, so this control is disabled here.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-300">Dynamic Shadows</span>
                  <p className="text-xs text-gray-500">Toggles the scene's real-time shadow rendering.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.shadows}
                    onChange={(e) => setSettings({ shadows: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700"></div>
                </label>
              </div>
            </div>
          )}

          {/* ── LANGUAGE (dedicated category, P1.6) ── */}
          {activeTab === 'language' && (
            <div className="space-y-4">
              {sectionTitle(tl('settings.language'))}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSettings({ language: 'en' })}
                  className={`flex items-center gap-3 px-4 py-3 border transition-all ${
                    settings.language === 'en'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                  }`}
                >
                  <span className="text-2xl">🇬🇧</span>
                  <span className="text-sm font-bold text-white">English</span>
                </button>
                <button
                  onClick={() => setSettings({ language: 'id' })}
                  className={`flex items-center gap-3 px-4 py-3 border transition-all ${
                    settings.language === 'id'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                  }`}
                >
                  <span className="text-2xl">🇮🇩</span>
                  <span className="text-sm font-bold text-white">Indonesia</span>
                </button>
              </div>
            </div>
          )}

          {/* ── CONTROLS ── */}
          {activeTab === 'controls' && (
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400/90 uppercase tracking-widest">Keyboard Controls</h3>
                  <p className="text-xs text-slate-400">All keyboard controls for desktop gameplay.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ControlRow label="Move" keys="W A S D" description="Movement" />
                  <ControlRow label="Jump" keys="Space" description="Jump / Double Jump" />
                  <ControlRow label="Sprint" keys="Shift" description="Hold to sprint" />
                  <ControlRow label="Dodge" keys="K" description="Dodge / roll with brief invulnerability" />
                  <ControlRow label="Attack" keys="J" description="Basic attack" />
                  <ControlRow label="Interact" keys="E" description="Talk to NPCs, activate checkpoints" />
                  <ControlRow label="Inventory" keys="I / Tab" description="Open/close inventory" />
                  <ControlRow label="Quest Journal" keys="L" description="Open/close quest log" />
                  <ControlRow label="Hotbar Select" keys="1-7" description="Select hotbar slot" />
                  <ControlRow label="Hotbar Use" keys="Shift + 1-7" description="Use item in hotbar slot" />
                  <ControlRow label="Shield" keys="F" description="Equip/unequip shield" />
                  <ControlRow label="Quick Heal" keys="Q / H" description="Use healing item" />
                  <ControlRow label="Cheat Console" keys="` / ~" description="Toggle developer console" />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-800">
                <h3 className="text-sm font-semibold text-amber-400/90 uppercase tracking-widest">Controls Notes</h3>
                <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                  <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">Escape</kbd> to close any open modal or menu.</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">Tab</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">I</kbd> to toggle inventory at any time.</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">L</kbd> to view your quest journal.</li>
                  <li>Select a hotbar slot with <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">1-7</kbd>, then press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">Shift</kbd> + number to use the item.</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">F</kbd> to toggle shield equipment.</li>
                  <li>Open the developer console with <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">`</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">~</kbd> for cheat commands.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── DEBUG MODE ── */}
          {activeTab === 'debug' && (
            <div className="space-y-5">
              <div className="space-y-4">
                {sectionTitle('Debug Mode')}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Enable Debug Telemetry</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.debugMode}
                      onChange={(e) => setSettings({ debugMode: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                <p className="text-xs text-gray-500">
                  When enabled, a compact telemetry overlay appears at the top-center of the gameplay screen. It does not affect gameplay logic, movement, combat, or performance beyond the rendering cost of the overlay itself.
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">F-Mode</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.fMode}
                      onChange={(e) => setSettings({ fMode: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                <p className="text-xs text-gray-500">
                  When enabled, a draggable F1–F12 strip appears at the top of the screen. It is separate from the Custom HUD editor.
                </p>
              </div>

              {/* Debug Telemetry Preview (read-only, always visible in this tab) */}
              <div className="space-y-4 border-t border-gray-800 pt-5">
                <div className="flex items-center gap-2">
                  <Bug size={16} className="text-amber-400" />
                  <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-widest">Telemetry Preview</h3>
                </div>

                <div className="bg-gray-950/50 border border-gray-800 p-4 space-y-4">
                  {/* NPC Interaction */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users size={13} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">NPC Interaction</span>
                    </div>
                    {infoRow('Nearest NPC', debug.nearestNpcName || 'None')}
                    {infoRow(
                      'Distance',
                      debug.currentDistance < 900 ? `${debug.currentDistance.toFixed(2)}m` : 'N/A'
                    )}
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-gray-300">Is Near (&le;3.8m)</span>
                      {trueFalseBadge(debug.isNear)}
                    </div>
                    {infoRow(
                      'E Pressed',
                      `${debug.ePressedCount}x${debug.ePressedCount > 0 ? ` @ ${debug.lastEPressedTime}` : ''}`
                    )}
                  </div>

                  {/* Dialogue System */}
                  <div className="space-y-2 border-t border-gray-800/50 pt-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare size={13} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dialogue System</span>
                    </div>
                    {infoRow(
                      'Open Dialogue Calls',
                      `${debug.openDialogueCalledCount}x${
                        debug.openDialogueCalledCount > 0 ? ` @ ${debug.lastOpenDialogueTime}` : ''
                      }`
                    )}
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-gray-300">Active Dialogue</span>
                      {trueFalseBadge(activeDialogue !== null)}
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-gray-300">Dialogue Modal Mounted</span>
                      {trueFalseBadge(debug.dialogueModalMounted)}
                    </div>
                  </div>

                  {/* Live State */}
                  <div className="space-y-2 border-t border-gray-800/50 pt-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity size={13} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live State</span>
                    </div>
                    {infoRow('Dialogue Flag (store)', trueFalseBadge(debug.activeDialogueNotNull))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

          {/* ── CHEATS (P1.6): removed from normal Settings. The command
              console remains reachable via the backtick hotkey (` / ~) only. */}

        {/* Footer */}
        <div className="p-4 border-t border-amber-900/40 bg-stone-950 flex gap-3">
          <button
            onClick={() => {
              saveGame();
              setShowSettings(false);
            }}
            className="flex-1 bg-amber-700 hover:bg-amber-600 text-stone-50 font-bold py-2 px-4 transition-colors rounded"
          >
            {tl('settings.saveApply')}
          </button>
          <button
            onClick={() => {
              returnToMenu();
            }}
            className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-amber-100/80 font-bold py-2 px-4 transition-colors border border-amber-900/50 rounded"
            title="Save and return to main menu"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline text-xs uppercase tracking-wider">Main Menu</span>
          </button>
        </div>

        {/* Discard Changes Confirmation Dialog */}
        {showDiscardDialog && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div className="bg-stone-900 border border-amber-900/50 p-6 max-w-sm w-full mx-4 shadow-2xl rounded-lg">
              <h3 className="text-lg font-bold text-white mb-2">{tl('settings.discardTitle')}</h3>
              <p className="text-sm text-gray-400 mb-6">{tl('settings.discardBody')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-amber-700 hover:bg-amber-600 text-stone-50 font-bold py-2 px-4 transition-colors rounded"
                >
                  {tl('settings.continue')}
                </button>
                <button
                  onClick={() => setShowDiscardDialog(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2 px-4 border border-gray-700 transition-colors"
                >
                  {tl('settings.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Control Row Component ────────────────────────────────────────────
function ControlRow({ label, keys, description }: { label: string; keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div>
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <div className="flex flex-wrap gap-1 justify-end">
        {keys.split(' / ').map((key, idx) => (
          <kbd key={idx}
            className="px-2 py-1 bg-slate-700/80 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-600/50"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
