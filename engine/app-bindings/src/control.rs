use process_mining::Control;

/// `ctl` without its partial results, for a step whose partials are not those of the binding,
/// with `prefix` before each stage name.
pub(crate) fn progress_only<'a>(ctl: &'a Control<'_>, prefix: Option<&'a str>) -> Control<'a> {
    let progress = Control::new().on_progress(move |p| match prefix {
        Some(prefix) => ctl.progress(format!("{prefix}: {}", p.stage), p.done, p.total),
        None => ctl.progress(p.stage, p.done, p.total),
    });
    match ctl.cancel_flag_ref() {
        Some(flag) => progress.cancel_flag(flag),
        None => progress,
    }
}
