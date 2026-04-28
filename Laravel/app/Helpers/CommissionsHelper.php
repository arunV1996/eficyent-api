<?php

namespace App\Helpers;

use App\Models\Fee;
use App\Models\VirtualAccount;
use Exception;
use Illuminate\Support\Facades\Log;

class CommissionsHelper
{

    public static function calc_fx_commissions($quote, $user)
    {
        $baseRate = $quote['fx_rate'];

        $virtualAccount = VirtualAccount::where('id', $quote['source_id'])->first();

        throw_if(!$virtualAccount, new Exception(api_error(116), 116));

        $currency1 = $virtualAccount->currency;

        $currency2 = $quote['receiving_currency'];

        $merchant = $user->merchant;

        $userCommission = 0;

        $merchantCommission = 0;

        $isUserFixed = false;

        $isMerchantFixed = false;

        $userFee = $user->fees()
            ->where('fee_name', FX_FEE)
            ->where('currency_1', $currency1)
            ->where('currency_2', $currency2)
            ->first();

        if (!$userFee && !$merchant) {

            $userFee = Fee::where('fee_name', FX_FEE)
                ->whereNull('owner_type')
                ->whereNull('owner_id')
                ->where('currency_1', $currency1)
                ->where('currency_2', $currency2)
                ->first();
        }

        if ($userFee && $userFee->fee_value > 0) {

            $userCommission = self::calculateFxCommission($baseRate, $userFee, $isUserFixed);
        }

        if ($merchant) {

            $merchantFee = $merchant->fees()
                ->where('fee_name', FX_FEE)
                ->where('currency_1', $currency1)
                ->where('currency_2', $currency2)
                ->first();

            if (!$merchantFee) {

                $merchantFee = Fee::where('fee_name', FX_FEE)
                    ->whereNull('owner_type')
                    ->whereNull('owner_id')
                    ->where('currency_1', $currency1)
                    ->where('currency_2', $currency2)
                    ->first();
            }

            if ($merchantFee && $merchantFee->fee_value > 0) {

                $merchantCommission = self::calculateFxCommission($baseRate, $merchantFee, $isMerchantFixed);
            }
        }

        if ($isUserFixed || $isMerchantFixed) {

            $fixedRate = $isUserFixed ? $userCommission : $merchantCommission;

            if ($quote['quote_type'] == QUOTE_TYPE_FORWARD) {

                $sendingAmount   = $quote['amount'];

                $receivingAmount = $sendingAmount * $fixedRate;
            } else {

                $receivingAmount = $quote['receiving_amount'];

                $sendingAmount   = $receivingAmount / $fixedRate;
            }

            return [
                'commission_value' => 0,
                'fx_rate'          => $fixedRate,
                'internal_fx_rate' => $fixedRate,
                'receiving_amount' => $receivingAmount,
                'amount'           => $sendingAmount,
            ];
        }

        if ($merchant && $userFee) {

            $internalFxRate  = $baseRate - $merchantCommission;

            $finalFxRate     = $baseRate - ($merchantCommission + $userCommission);

            $totalCommission = $merchantCommission + $userCommission;
        } elseif ($merchant) {

            $internalFxRate  = $baseRate - $merchantCommission;

            $finalFxRate     = $internalFxRate;

            $totalCommission = $merchantCommission;
        } else {

            $internalFxRate  = $baseRate - $userCommission;

            $finalFxRate     = $internalFxRate;

            $totalCommission = $userCommission;
        }

        if ($quote['quote_type'] == QUOTE_TYPE_FORWARD) {

            $sendingAmount   = $quote['amount'];

            $receivingAmount = $sendingAmount * $finalFxRate;
        } else {

            $receivingAmount = $quote['receiving_amount'];

            $sendingAmount   = $receivingAmount / $finalFxRate;
        }

        return [
            'commission_value' => $totalCommission,
            'fx_rate'          => $finalFxRate,
            'internal_fx_rate' => $internalFxRate,
            'receiving_amount' => $receivingAmount,
            'amount'           => $sendingAmount,
        ];
    }

    public static function calc_transaction_commissions($quote, $user)
    {
        $commission = [
            'commission_amount' => 0,
            'merchant_commission_amount' => 0
        ];

        $currency = $quote['receiving_currency'];

        $userFee = $user->fees()
            ->where('fee_name', TRANSACTION_FEE)
            ->where('currency_1', $currency)
            ->where('mode', isset($quote['payment_rail']) ? $quote['payment_rail'] : null)
            ->first();

        if (!$userFee && !$user->merchant) {

            $userFee = Fee::where('fee_name', TRANSACTION_FEE)
                ->whereNull('owner_type')
                ->whereNull('owner_id')
                ->where('mode', isset($quote['payment_rail']) ? $quote['payment_rail'] : null)
                ->where('currency_1', $currency)
                ->first();
        }

        if ($userFee) {

            $commission['merchant_commission_amount'] = self::calculateFeeAmount($userFee, $quote['amount']);
        }

        if ($user->merchant) {

            $merchant = $user->merchant;

            $merchantFee = $merchant->fees()
                ->where('fee_name', TRANSACTION_FEE)
                ->where('currency_1', $currency)
                ->where('mode', isset($quote['payment_rail']) ? $quote['payment_rail'] : null)
                ->first();

            if (!$merchantFee) {

                $merchantFee = Fee::where('fee_name', TRANSACTION_FEE)
                    ->whereNull('owner_type')
                    ->whereNull('owner_id')
                    ->where('mode', isset($quote['payment_rail']) ? $quote['payment_rail'] : null)
                    ->where('currency_1', $currency)
                    ->first();
            }

            if ($merchantFee) {

                $commission['commission_amount'] = self::calculateFeeAmount($merchantFee, $quote['amount']);
            }
        }

        if (!$user->merchant) {

            $commission['commission_amount'] = $commission['merchant_commission_amount'] + $commission['commission_amount'];

            $commission['merchant_commission_amount'] = 0;
        }

        return $commission;
    }

    private static function calculateFeeAmount($fee, float $amount): float
    {
        $feeType = (int) $fee->fee_type;

        if ($feeType === FEE_TYPE_FLAT) {

            return (float) $fee->fee_value;
        }

        if ($feeType === FEE_TYPE_PERCENTAGE) {

            return ($amount * (float) $fee->fee_value) / 100;
        }

        return 0.0;
    }

    private static function calculateFxCommission(float $fxRate, $fee, &$isFixedFee = false): float
    {

        if ((int) $fee->fee_type === FEE_TYPE_FLAT) {
            return (float) $fee->fee_value;
        }

        if ((int) $fee->fee_type === FEE_TYPE_PERCENTAGE) {
            return ($fxRate * $fee->fee_value) / 100;
        }

        if ((int) $fee->fee_type === FEE_TYPE_FIXED) {

            $isFixedFee = true;

            return (float) $fee->fee_value;
        }

        return 0;
    }

    public static function calc_deposit_commissions($user, $amount, $currency)
    {
        $commission = [
            'commission_amount' => 0,
            'merchant_commission_amount' => 0
        ];

        $userFee = $user->fees()
            ->where('fee_name', DEPOSIT_FEE)
            ->where('currency_1', $currency)
            ->first();

        if (!$userFee && !$user->merchant) {
            $userFee = Fee::where('fee_name', DEPOSIT_FEE)
                ->whereNull('owner_type')
                ->whereNull('owner_id')
                ->where('currency_1', $currency)
                ->first();
        }

        if ($userFee) {

            $commission['merchant_commission_amount'] = self::calculateFeeAmount($userFee, $amount);
        }

        if ($user->merchant) {

            $merchantFee = $user->merchant->fees()
                ->where('fee_name', DEPOSIT_FEE)
                ->where('currency_1', $currency)
                ->first();

            if (!$merchantFee) {
                $merchantFee = Fee::where('fee_name', DEPOSIT_FEE)
                    ->whereNull('owner_type')
                    ->whereNull('owner_id')
                    ->where('currency_1', $currency)
                    ->first();
            }

            if ($merchantFee) {

                $commission['commission_amount'] = self::calculateFeeAmount($merchantFee, $amount);
            }
        }

        if (!$user->merchant) {

            $commission['commission_amount'] = $commission['merchant_commission_amount'] + $commission['commission_amount'];

            $commission['merchant_commission_amount'] = 0;
        }

        return $commission;
    }

    public static function calculate_rate_commission($rate, $user)
    {
        $baseRate = $rate['fx_rate'];

        $currency1 = $rate['from_currency'];

        $currency2 = $rate['to_currency'];

        $merchant = $user->merchant;

        $userCommission = 0;
        
        $merchantCommission = 0;

        $isUserFixed = false;
        
        $isMerchantFixed = false;

        $userFee = $user->fees()
            ->where('fee_name', FX_FEE)
            ->where('currency_1', $currency1)
            ->where('currency_2', $currency2)
            ->first();

        if (!$userFee && !$merchant) {
        
            $userFee = Fee::where('fee_name', FX_FEE)
                ->whereNull('owner_type')
                ->whereNull('owner_id')
                ->where('currency_1', $currency1)
                ->where('currency_2', $currency2)
                ->first();
        }

        if ($userFee) {
        
            $userCommission = self::calculateFxCommission($baseRate, $userFee, $isUserFixed);
        }

        if ($merchant) {
        
            $merchantFee = $merchant->fees()
                ->where('fee_name', FX_FEE)
                ->where('currency_1', $currency1)
                ->where('currency_2', $currency2)
                ->first();

            if (!$merchantFee) {
        
                $merchantFee = Fee::where('fee_name', FX_FEE)
                    ->whereNull('owner_type')
                    ->whereNull('owner_id')
                    ->where('currency_1', $currency1)
                    ->where('currency_2', $currency2)
                    ->first();
            }

            if ($merchantFee) {
        
                $merchantCommission = self::calculateFxCommission($baseRate, $merchantFee, $isMerchantFixed);
            }
        }
        if ($isUserFixed || $isMerchantFixed) {
        
            return $isUserFixed ? $userCommission : $merchantCommission;
        }

        if ($merchant && $userFee) {
        
            $finalFxRate = $baseRate - ($merchantCommission + $userCommission);
        } elseif ($merchant) {
        
            $finalFxRate = $baseRate - $merchantCommission;
        } else {
        
            $finalFxRate = $baseRate - $userCommission;
        }

        return $finalFxRate;
    }
}
