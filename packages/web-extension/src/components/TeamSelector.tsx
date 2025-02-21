import { FormControl, FormLabel, Select, Text } from '@chakra-ui/react';
import type { Team } from '~/types';

interface TeamSelectorProps {
  teams: Team[];
  currentTeam?: Team;
  onChange: (team: Team | undefined) => void;
  disabled?: boolean;
}

export function TeamSelector({
  teams,
  currentTeam,
  onChange,
  disabled = false,
}: TeamSelectorProps) {
  return (
    <FormControl mb={4}>
      <FormLabel>Team</FormLabel>
      {teams.length === 0 ? (
        <Text color="gray.500">No teams found</Text>
      ) : (
        <Select
          placeholder="Choose a team..."
          value={currentTeam ? currentTeam.id.toString() : ''}
          onChange={(e) => {
            const selectedTeam = teams.find(
              (t) => t.id === Number(e.target.value)
            );
            onChange(selectedTeam);
          }}
          disabled={disabled}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      )}
    </FormControl>
  );
}
