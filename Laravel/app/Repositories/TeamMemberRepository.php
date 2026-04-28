<?php

namespace App\Repositories;

use App\Helpers\Helper;
use App\Models\Sender;
use App\Models\SenderDocument;
use App\Models\TeamMember;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TeamMemberRepository
{
    public function list($user, Request $request)
    {
        $status = null;

        if ($request->filled('status')) {

            $status = team_member_status_map()[$request->status] ?? null;
        }

        $permission = null;

        if ($request->filled('permission')) {

            $permission = user_permission_map()[$request->permission] ?? null;
        }

        $role = null;

        if ($request->filled('role')) {

            $role = user_role_map()[$request->role] ?? null;

        }

        $base_query = TeamMember::where('user_id', $user->id)
            ->when($request->filled('search_key'), function ($query) use ($request) {
                $query->where('name', 'like', '%' . $request->search_key . '%')
                    ->orWhere('email', 'like', '%' . $request->search_key . '%')
                    ->orWhere('mobile', 'like', '%' . $request->search_key . '%');
            })
            ->when(!is_null($status), function ($query) use ($status) {
                $query->where('status', $status);
            })
            ->when(!is_null($role), function ($query) use ($role) {
                $query->where('role', $role);
            })
            ->when(!is_null($permission), function ($query) use ($permission) {
                $query->where('permission', $permission);
            })
            ->when(is_null($role), function ($query) {
                $query->where('role', '!=', TEAM_MEMBER_ROLE_CORPORATE);
            });

        $base_query->orderBy('created_at', 'desc');

        list($skip, $take) = [
            $request->skip ?? 0,
            $request->take ?? TAKE_COUNT
        ];

        return [
            'total' => $base_query->count(),
            'team_members' => $base_query->skip($skip)->take($take)->get(),
        ];
    }
    public function create(array $validated, $user)
    {

        $team_member = DB::transaction(function () use ($validated, $user) {

            $team_member = TeamMember::create($validated);

            return $team_member;
        });

        return $team_member;
    }

    public function update(array $validated, $team_member)
    {

        $team_member = DB::transaction(function () use ($validated, $team_member) {

            $team_member->update($validated);

            return $team_member;
        });

        return $team_member;
    }

    public function delete($team_member)
    {
        DB::transaction(function () use ($team_member) {

            $team_member->delete();
        });

        return true;
    }

    public function update_status(array $validated, $user): bool
    {
        $teamMember = TeamMember::where('unique_id', $validated['team_member_id'])
            ->where('user_id', $user->id)
            ->firstOrFail();

        $newStatus = $teamMember->status === TEAM_MEMBER_DISABLED
            ? TEAM_MEMBER_ACTIVE
            : TEAM_MEMBER_DISABLED;

        DB::transaction(function () use ($teamMember, $newStatus) {
            $teamMember->update([
                'status' => $newStatus
            ]);
        });

        return true;
    }
}
