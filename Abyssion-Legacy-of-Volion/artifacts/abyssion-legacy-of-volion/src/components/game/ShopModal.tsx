'use client';

import { useGameStore } from '@/lib/store';
import { SHOP_ITEMS } from '@/lib/questData';
import { getItem } from '@/lib/items';
import { useTranslation } from '@/lib/useTranslation';
import { X, ShoppingCart } from 'lucide-react';

export default function ShopModal() {
  const { ui, closeShop, purchaseShopItem, player } = useGameStore();
  const { tl } = useTranslation();

  if (!ui.showShop) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-wider">{tl('shop.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-yellow-400">🪙 {player.gold}</span>
            <button
              onClick={closeShop}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Shop Items */}
        <div className="p-4 space-y-2 overflow-y-auto max-h-[60vh]">
          {SHOP_ITEMS.map(({ itemId, price }) => {
            const def = getItem(itemId);
            if (!def) return null;

            return (
              <div
                key={itemId}
                className="flex items-center justify-between bg-gray-800/50 border border-gray-700 px-4 py-3 hover:border-gray-500 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{def.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{def.description}</div>
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <span className="text-xs font-bold text-yellow-400 whitespace-nowrap">🪙 {price}</span>
                  <button
                    onClick={() => purchaseShopItem(itemId, price, 1)}
                    disabled={player.gold < price}
                    className={`px-3 py-1.5 text-xs font-bold transition-all ${
                      player.gold >= price
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Buy
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 bg-gray-950 text-center">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
            {tl('shop.buyFood')}
          </span>
        </div>
      </div>
    </div>
  );
}
