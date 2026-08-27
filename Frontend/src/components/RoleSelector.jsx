export default function RoleSelector({ value, onChange }) {
  return (
    <fieldset className="role-selector">
      <legend>Account type</legend>
      {["customer", "seller"].map((role) => (
        <label className={value === role ? "role-option selected" : "role-option"} key={role}>
          <input type="radio" name="role" value={role} checked={value === role} onChange={(event) => onChange(event.target.value)} />
          {role[0].toUpperCase() + role.slice(1)}
        </label>
      ))}
    </fieldset>
  );
}
