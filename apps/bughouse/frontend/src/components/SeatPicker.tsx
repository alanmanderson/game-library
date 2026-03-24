import React from 'react';

export type SeatNameValue =
  | 'board_a_white'
  | 'board_a_black'
  | 'board_b_white'
  | 'board_b_black';

interface SeatPickerProps {
  players: Record<string, string | null>;
  onSelect: (seat: SeatNameValue) => void;
  selectedSeat: SeatNameValue | null;
  disabled?: boolean;
}

const SEATS: { seat: SeatNameValue; seatIndex: string; label: string; board: string; team: string }[] = [
  { seat: 'board_a_white', seatIndex: '0', label: 'White', board: 'Board A', team: 'Team A' },
  { seat: 'board_a_black', seatIndex: '1', label: 'Black', board: 'Board A', team: 'Team B' },
  { seat: 'board_b_white', seatIndex: '2', label: 'White', board: 'Board B', team: 'Team B' },
  { seat: 'board_b_black', seatIndex: '3', label: 'Black', board: 'Board B', team: 'Team A' },
];

const SeatPicker: React.FC<SeatPickerProps> = ({ players, onSelect, selectedSeat, disabled }) => {
  const boardA = SEATS.filter(s => s.board === 'Board A');
  const boardB = SEATS.filter(s => s.board === 'Board B');

  const renderSeat = (s: typeof SEATS[0]) => {
    const occupant = players[s.seatIndex];
    const taken = !!occupant;
    const isSelected = selectedSeat === s.seat;
    const clickable = !taken && !disabled;

    return (
      <div
        key={s.seat}
        className={
          'seat-picker-seat' +
          (taken ? ' taken' : '') +
          (isSelected ? ' selected' : '') +
          (clickable ? ' clickable' : '')
        }
        onClick={() => clickable && onSelect(s.seat)}
      >
        <span className="seat-picker-label">{s.board} - {s.label}</span>
        <span className="seat-picker-team-label">{s.team}</span>
        <span className="seat-picker-occupant">
          {taken ? occupant : 'Open'}
        </span>
      </div>
    );
  };

  return (
    <div className="seat-picker">
      <div className="seat-picker-boards">
        <div className="seat-picker-board">
          <div className="seat-picker-board-title">Board A</div>
          {boardA.map(renderSeat)}
        </div>
        <div className="seat-picker-board">
          <div className="seat-picker-board-title">Board B</div>
          {boardB.map(renderSeat)}
        </div>
      </div>
    </div>
  );
};

export default SeatPicker;
