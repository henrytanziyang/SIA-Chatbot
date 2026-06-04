interface Option {
  label: string;
  nextId: string;
}

interface OptionButtonsProps {
  options: Option[];
  onSelect: (option: Option) => void;
}

export function OptionButtons({ options, onSelect }: OptionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          className="px-4 py-2 bg-[#6F2C91] text-white rounded-lg hover:bg-[#6F2C91]/90 transition-colors"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
