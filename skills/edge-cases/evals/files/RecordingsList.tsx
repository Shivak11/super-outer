export function RecordingsList({ recordings }: { recordings: { title: string; createdAt: string }[] }) {
  const latest = recordings[0];
  return (
    <View>
      <Text>Last recorded {latest.title} on {latest.createdAt}</Text>
      {recordings.map((r) => <Row key={r.createdAt} item={r} />)}
    </View>
  );
}
