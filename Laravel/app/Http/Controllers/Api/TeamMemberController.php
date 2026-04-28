<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TeamMembers\TeamMembersCreateRequest;
use App\Http\Requests\TeamMembers\TeamMembersGetRequest;
use App\Http\Requests\TeamMembers\TeamMembersUpdateRequest;
use App\Http\Resources\TeamMemberResource;
use App\Models\TeamMember;
use App\Repositories\TeamMemberRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class TeamMemberController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new TeamMemberRepository();
    }
    public function index(Request $request)
    {

        try {

            $user = $request->user();

            $team_members = $this->repository->list($user, $request);

            $data['total'] = $team_members['total'];

            $data['team_members'] = TeamMemberResource::collection($team_members['team_members']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function store(TeamMembersCreateRequest $request)
    {

        try {

            $user = $request->user();

            $validated = $request->validated();

            $validated['password'] = Hash::make($validated['password']);

            $team_member = $this->repository->create($validated, $user);

            $team_member->refresh();

            $data['team_member'] = new TeamMemberResource($team_member);

            return $this->sendResponse(tr('team_member_create_success'), '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show(TeamMembersGetRequest $request)
    {

        try {

            $user = $request->user();

            $validated = $request->validated();

            $team_member = TeamMember::where('unique_id', $validated['team_member_id'])->where('user_id', $user->id)->first();

            throw_if(!$team_member, new Exception(api_error(159), 159));

            $data['team_member'] = new TeamMemberResource($team_member);

            return $this->sendResponse(tr('team_member_fetch_success'), '', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function update(TeamMembersUpdateRequest $request)
    {

        try {

            $user = $request->user();

            $validated = $request->validated();

            $team_member = TeamMember::where('unique_id', $validated['team_member_id'])->where('user_id', $user->id)->first();

            throw_if(!$team_member, new Exception(api_error(159), 159));

            $team_member = $this->repository->update($validated, $team_member);

            $team_member->refresh();

            $data['team_member'] = new TeamMemberResource($team_member);

            return $this->sendResponse(tr('team_member_update_success'), '', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function destroy(TeamMembersGetRequest $request)
    {

        try {

            $user = $request->user();

            $validated = $request->validated();

            $team_member = TeamMember::where('unique_id', $validated['team_member_id'])->where('user_id', $user->id)->first();

            throw_if(!$team_member, new Exception(api_error(159), 159));

            $this->repository->delete($team_member);

            return $this->sendResponse(tr('team_member_delete_success'), '', []);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function update_status(TeamMembersGetRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $update = $this->repository->update_status($validated, $user);

            return $this->sendResponse(tr('team_member_status_update_success'), '', []);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
