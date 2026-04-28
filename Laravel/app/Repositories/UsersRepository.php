<?php

namespace App\Repositories;

use App\Models\Ledger;
use App\Models\User;
use Exception;

class UsersRepository
{
    public function list($request, $user, $merchant)
    {
        $query = User::where('merchant_id', $merchant->id)->where('id', '!=', $user->id);

        if (!empty($request->from_date) && !empty($request->to_date)) {

            $query->whereBetween('created_at', [
                $request->from_date . ' 00:00:00',
                $request->to_date . ' 23:59:59',
            ]);
        }

        if ($request->has('search_key') && !empty($request->search_key)) {

            $key = '%' . $request->search_key . '%';

            $query->where(function ($q) use ($key) {

                $q->where('first_name', 'like', $key)
                    ->orWhere('last_name', 'like', $key)
                    ->orWhere('mobile', 'like', $key)
                    ->orWhere('email', 'like', $key)
                    ->orWhere('unique_id', 'like', $key);
            });
        }

        $total = $query->count();

        $skip = $request->skip ?? 0;

        $take = $request->take ?? TAKE_COUNT;
        
        $users = $query->orderBy('created_at', 'desc')->skip($skip)->take($take)->get();

        return [
            'total' => $total,
            'users' => $users
        ];
    }

    public function show($validated, $merchant)
    {
        $user = User::where('merchant_id', $merchant->id)
            ->where('unique_id', $validated['unique_id'])
            ->first();

        throw_if(!$user, new Exception(api_error(102), 102));

        return $user;
    }
}
