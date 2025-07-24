interface Props {
    logLines: string[];
    maxHeight: string;
}

export function Terminal(props: Props) {
    return (
        <div className="bg-black rounded-md p-4 mt-2 border border-gray-700 shadow-lg">
            <div
                className="font-mono text-xs text-green-400 overflow-auto whitespace-pre-wrap"
                style={{maxHeight: props.maxHeight}}
                ref={(el) => {
                if (el && props.logLines.length > 0) {
                    el.scrollTop = el.scrollHeight;
                }
                }}
            >
                {props.logLines.map((line, index) => (
                <div key={index} className="py-0.5">
                    {line || ' '}
                </div>
                ))}
            </div>
        </div>
    );
}