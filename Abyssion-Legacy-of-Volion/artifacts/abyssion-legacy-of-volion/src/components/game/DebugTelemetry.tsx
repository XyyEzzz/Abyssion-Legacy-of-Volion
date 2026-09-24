'use client';

import { useGameStore } from '@/lib/store';

function DebugTelemetryContent() {
  const debug = useGameStore(s => s.debug);
  const player = useGameStore(s => s.player);
  const inputs = useGameStore(s => s.inputs);

  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3 text-[10px] leading-tight">
      <span className="text-gray-500 uppercase">{label}</span>
      <span className="text-emerald-400 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-1 z-20 pointer-events-none select-none font-mono"
      style={{ minWidth: '200px' }}
    >
      <div
        className="bg-black/80 border border-gray-700 px-3 py-2 space-y-1"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <div className="text-[9px] text-amber-400 font-bold uppercase tracking-widest border-b border-gray-800 pb-1 mb-1">
          DEBUG TELEMETRY
        </div>
        {row('HP', `${Math.round(player.health)}/${player.maxHealth}`)}
        {row('STA', `${Math.round(player.stamina)}/${player.maxStamina}`)}
        {row('POS', `${player.position[0].toFixed(1)},${player.position[1].toFixed(1)},${player.position[2].toFixed(1)}`)}
        {row('COMBO', player.comboStage)}
        {row('COMBAT', player.inCombat ? 'YES' : 'NO')}
        {row('DODGE', player.isDodging ? 'YES' : 'NO')}
        {row('ATK', player.isAttacking ? 'YES' : 'NO')}
        {row('JOY', `${inputs.joystick.x.toFixed(2)},${inputs.joystick.y.toFixed(2)}`)}
        {row('CAM_A', inputs.cameraAngle.toFixed(3))}
        {row('CAM_P', inputs.cameraPitch.toFixed(3))}
        {row('NPC', debug.nearestNpcName || 'None')}
        {row('NEAR', debug.isNear ? 'YES' : 'NO')}
        {row('DIST', debug.currentDistance < 900 ? `${debug.currentDistance.toFixed(2)}m` : 'N/A')}
      </div>
    </div>
  );
}

export default function DebugTelemetry() {
  const debugMode = useGameStore(s => s.settings.debugMode);
  if (!debugMode) return null;
  return <DebugTelemetryContent />;
}
