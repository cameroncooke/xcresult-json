import SwiftUI

// MARK: - Calculator Display Component
struct CalculatorDisplay: View {
    let expressionDisplay: String
    let display: String
    
    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            // Expression display (smaller, secondary)
            Text(expressionDisplay)
                .font(.title2)
                .foregroundColor(.white.opacity(0.7))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            
            // Main result display
            Text(display)
                .font(.system(size: 56, weight: .light, design: .rounded))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.3)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 30)
        .frame(height: 140)
    }
}