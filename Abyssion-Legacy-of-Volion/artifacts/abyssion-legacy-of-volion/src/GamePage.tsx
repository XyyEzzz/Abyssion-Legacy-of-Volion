import Game from '@/components/game/Game';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="w-full h-screen bg-black" style={{ height: '100dvh' }}>
      <Game />
    </div>
  );
}
