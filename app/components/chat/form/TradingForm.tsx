// app/components/chat/form/TradingForm.tsx
import React, { useState } from 'react';
import { classNames } from '~/utils/classNames';

interface TradingFormProps {
  formValues: any;
  handleFormChange: (field: string, value: string) => void;
  isFormCollapsed: boolean;
  currentStep: number;
  isStrategySelectDisabled: boolean;
  onExpand: () => void;
}

export const TradingForm = ({
  formValues,
  handleFormChange,
  isFormCollapsed,
  currentStep,
  isStrategySelectDisabled,
  onExpand
}: TradingFormProps) => {
  const [showCustomStrategy, setShowCustomStrategy] = useState(false);

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'custom') {
      setShowCustomStrategy(true);
      handleFormChange('strategy', '');
    } else {
      setShowCustomStrategy(false);
      handleFormChange('strategy', value);
    }
    if (isFormCollapsed) {
      onExpand();
    }
  };

  const handleCustomStrategyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFormChange('strategy', e.target.value);
  };

  const handleRiskOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleFormChange('riskOption', e.target.value);
    if (isFormCollapsed) {
      onExpand();
    }
  };

  // Helper function to check if a field should be shown
  const shouldShowField = (step: number) => {
    if (step === 1) return true;
    if (step === 2) return formValues.strategy && formValues.riskOption;
    if (step === 3) return formValues.strategy && formValues.riskOption && formValues.symbols;
    if (step === 4) return formValues.strategy && formValues.riskOption && formValues.symbols && 
                    (formValues.buyConditions || formValues.sellConditions);
    if (step === 5) return formValues.strategy && formValues.riskOption && formValues.symbols && 
                    formValues.buyConditions && formValues.sellConditions;
    return false;
  };

  return (
    <div className="p-4 space-y-4 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
      {/* Strategy Selection Row - Always Visible */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <select
            value={showCustomStrategy ? 'custom' : formValues.strategy}
            onChange={handleStrategyChange}
            className={classNames(
              "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme",
              {
                'opacity-50 cursor-not-allowed': isStrategySelectDisabled
              }
            )}
            disabled={isStrategySelectDisabled}
            required
          >
            <option value="" disabled>Select a Strategy</option>
            <option value="custom">Own Strategy</option>
            <option value="RSI">RSI</option>
            <option value="BB">BB</option>
            <option value="MACD">MACD</option>
            <option value="EMA">EMA</option>
            <option value="Trend Following Strategy">Trend Following Strategy</option>
            <option value="Swing Strategy">Swing Strategy</option>
            <option value="Scalping">Scalping</option>
          </select>

          {showCustomStrategy && (
            <input
              type="text"
              value={formValues.strategy}
              onChange={handleCustomStrategyChange}
              placeholder="Enter your custom strategy"
              className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
            />
          )}
        </div>

        <select
          value={formValues.riskOption}
          onChange={handleRiskOptionChange}
          className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
          required
        >
          <option value="GRID">GRID</option>
          <option value="DCA">DCA</option>
          <option value="SMART">SMART</option>
        </select>
      </div>

      {/* Additional Form Fields - Show when form is expanded or when fields are being filled */}
      {(!isFormCollapsed || currentStep > 1) && (
        <>
          {shouldShowField(2) && (
            <div className="grid grid-cols-1 gap-4 animate-fadeIn">
              <input
                type="text"
                placeholder="Symbols (e.g., BTCUSDT)"
                value={formValues.symbols}
                onChange={(e) => handleFormChange('symbols', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
            </div>
          )}

          {shouldShowField(3) && (
            <div className="grid grid-cols-2 gap-4 animate-fadeIn">
              <input
                type="text"
                placeholder="Buy Conditions"
                value={formValues.buyConditions}
                onChange={(e) => handleFormChange('buyConditions', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
              <input
                type="text"
                placeholder="Sell Conditions"
                value={formValues.sellConditions}
                onChange={(e) => handleFormChange('sellConditions', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
            </div>
          )}

          {shouldShowField(4) && (
            <div className="grid grid-cols-2 gap-4 animate-fadeIn">
              <input
                type="text"
                placeholder="Position Size"
                value={formValues.size}
                onChange={(e) => handleFormChange('size', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
              <select
                value={formValues.timeFrame}
                onChange={(e) => handleFormChange('timeFrame', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="30m">30m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="8h">8h</option>
                <option value="24h">24h</option>
                <option value="1w">1w</option>
                <option value="1m">1m</option>
                <option value="1y">1y</option>
              </select>
            </div>
          )}

          {shouldShowField(5) && (
            <div className="grid grid-cols-3 gap-4 animate-fadeIn">
              <input
                type="text"
                placeholder="Take Profit (TP)"
                value={formValues.tp}
                onChange={(e) => handleFormChange('tp', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
              <input
                type="text"
                placeholder="Stop Loss (SL)"
                value={formValues.sl}
                onChange={(e) => handleFormChange('sl', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
              <input
                type="text"
                placeholder="Trailing Stop (TS)"
                value={formValues.ts}
                onChange={(e) => handleFormChange('ts', e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none transition-theme"
                required
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
