import React, { useId, useRef, useState } from "react";

export default function CustomerField({
  label,
  value,
  onChange,
  options,
  onSelect,
  placeholder,
  type = "text",
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLocaleLowerCase();
  const matches = options.filter(
    (item) => showAll || item.search.toLocaleLowerCase().includes(query),
  );
  const select = (item) => {
    onSelect(item);
    setOpen(false);
    setActive(-1);
  };
  const move = (event, direction) => {
    event.preventDefault();
    setOpen(true);
    if (!open) setShowAll(true);
    const count = open ? matches.length : options.length;
    if (!count) return;
    const next =
      active < 0
        ? direction > 0
          ? 0
          : count - 1
        : (active + direction + count) % count;
    setActive(next);
    requestAnimationFrame(() =>
      document
        .getElementById(`${id}-option-${next}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  return (
    <div className="field customer-field">
      <label htmlFor={id}>{label}</label>
      <div className="suggestion-control">
        <input
          ref={inputRef}
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined}
          aria-activedescendant={
            open && active >= 0 ? `${id}-option-${active}` : undefined
          }
          onFocus={() => {
            setOpen(true);
            setShowAll(true);
            setActive(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setShowAll(false);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") move(event, 1);
            if (event.key === "ArrowUp") move(event, -1);
            if (event.key === "Enter" && open && matches[active]) {
              event.preventDefault();
              select(matches[active]);
            }
            if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        <button
          type="button"
          className="suggestion-toggle"
          tabIndex={-1}
          aria-label={`${label}历史记录`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            setOpen(!open);
            setShowAll(true);
            setActive(-1);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div
            className="suggestion-list"
            id={`${id}-list`}
            role="listbox"
            aria-label={`${label}历史选项`}
          >
            {matches.map((item, index) => (
              <button
                type="button"
                key={item.key}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
              >
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </button>
            ))}
            {!matches.length && (
              <div className="suggestion-empty">
                {options.length
                  ? "暂无匹配记录，可直接输入"
                  : "暂无历史记录，可直接输入"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
