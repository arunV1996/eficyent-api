<?php

namespace App\Http\Resources;

use App\Factories\Quotes\QuoteSourceFactory;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use stdClass;

class WalletTransactionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $data = [
            'unique_id' => $this->unique_id ?? '',
            'wallet' => $this->wallet ? new UserWalletResource($this->wallet) : new stdClass(),
            'quote' => $this->quote ? new QuoteResource($this->quote) : new stdClass(),
            'amount' => $this->amount ?? '',
            'fees' => $this->fees ?? '',
            'total_amount' => $this->total_amount ?? '',
            'status' => wallet_transaction_status_label($this->status) ?? '',
            'transaction_type' => $this->transaction_type ?? '',
            'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];

        $quoteSource = QuoteSourceFactory::resolve($this->quote->source_type, $this->quote->source_id, $this->user);

        if ($quoteSource instanceof VirtualAccount) {

            $data['virtual_account'] = new VirtualAccountResource($quoteSource);
        }
        return $data;
    }
}
